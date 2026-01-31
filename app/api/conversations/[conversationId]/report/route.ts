/**
 * Conversation Report API Route
 *
 * POST - Generate a new report version using OpenAI
 * Requires authentication, hive membership, and sufficient responses
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { canOpenReport } from "@/lib/conversations/domain/reportRules";
import { MIN_RESPONSES_FOR_REPORT } from "@/lib/conversations/domain/reportRules";
import { jsonError } from "@/lib/api/errors";
import { computeAgreementSummaries } from "@/lib/conversations/domain/agreementSummaries";
import {
  computeResponseConsensusItems,
  computeConsolidatedConsensusItems,
} from "@/lib/conversations/domain/responseConsensus";

interface ClusterBucketRow {
  id: string;
  consolidated_statement: string;
  conversation_cluster_bucket_members: Array<{ response_id: number }>;
}

interface UnconsolidatedResponseRow {
  response_id: number;
  conversation_responses: { response_text: string }[] | null;
}

interface ConsolidatedStatementWithVotes {
  id: string;
  statement: string;
  agreeVotes: number;
  passVotes: number;
  disagreeVotes: number;
  totalVotes: number;
  agreePercent: number;
  passPercent: number;
  disagreePercent: number;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Get conversation with all necessary fields
    const conversationResult = await supabase
      .from("conversations")
      .select("id, hive_id, type, phase, analysis_status, title")
      .eq("id", conversationId)
      .maybeSingle();

    if (!conversationResult) {
      return jsonError("Failed to fetch conversation", 500);
    }

    const { data: conversation, error: convError } = conversationResult;

    if (convError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 3. Verify hive membership
    try {
      await requireHiveMember(supabase, session.user.id, conversation.hive_id);
    } catch {
      return jsonError("Unauthorized: Must be a hive member", 403);
    }

    // 4. Validate conversation type
    if (conversation.type !== "understand") {
      return jsonError(
        "Reports can only be generated for 'understand' conversations",
        409
      );
    }

    // 5. Validate analysis status
    if (conversation.analysis_status !== "ready") {
      return jsonError(
        `Analysis must be ready before generating report (current: ${conversation.analysis_status})`,
        409
      );
    }

    // 6. Count responses and validate gate
    const responseCountResult = await supabase
      .from("conversation_responses")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (!responseCountResult) {
      return jsonError("Failed to count responses", 500);
    }

    const { count: responseCount, error: countError } = responseCountResult;

    if (countError) {
      return jsonError("Failed to count responses", 500);
    }

    const gate = canOpenReport(conversation.phase, responseCount || 0);
    if (!gate.allowed) {
      return jsonError(
        gate.reason || `Need at least ${MIN_RESPONSES_FOR_REPORT} responses`,
        409
      );
    }

    // 7. Fetch themes, responses, consolidated statements, and feedback for prompt building
    const [
      themesResult,
      responsesResult,
      feedbackResult,
      summaryResponsesResult,
      clusterBucketsResult,
      unconsolidatedResult,
    ] = await Promise.all([
      supabase
        .from("conversation_themes")
        .select("cluster_index, name, description, size")
        .eq("conversation_id", conversationId)
        .order("cluster_index", { ascending: true }),

      supabase
        .from("conversation_responses")
        .select("id, response_text, tag, cluster_index")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(100), // Limit for prompt size

      supabase
        .from("response_feedback")
        .select("response_id, feedback")
        .eq("conversation_id", conversationId),

      // Fetch response texts for agreement/divisive summaries (no prompt limit)
      supabase
        .from("conversation_responses")
        .select("id, response_text")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false }),

      // Fetch cluster buckets (consolidated statements) with their member response IDs
      supabase
        .from("conversation_cluster_buckets")
        .select(
          "id, consolidated_statement, conversation_cluster_bucket_members(response_id)"
        )
        .eq("conversation_id", conversationId),

      // Fetch unconsolidated responses with their text
      supabase
        .from("conversation_unconsolidated_responses")
        .select("response_id, conversation_responses(response_text)")
        .eq("conversation_id", conversationId),
    ]);

    if (
      !themesResult ||
      !responsesResult ||
      !feedbackResult ||
      !summaryResponsesResult ||
      themesResult.error ||
      responsesResult.error ||
      feedbackResult.error ||
      summaryResponsesResult.error
    ) {
      return jsonError("Failed to fetch conversation data", 500);
    }

    const themes = themesResult.data || [];
    const feedbackRows = feedbackResult.data || [];
    const summaryResponses = summaryResponsesResult.data || [];
    const clusterBuckets = (clusterBucketsResult?.data ||
      []) as ClusterBucketRow[];
    const unconsolidatedRows = (unconsolidatedResult?.data ||
      []) as UnconsolidatedResponseRow[];

    // 8. Build normalised feedback rows (explicit String keys for consistent Map lookups)
    const feedbackRowsMapped = feedbackRows.map((r) => ({
      responseId: String(r.response_id),
      feedback: String(r.feedback),
    }));

    // 9. Build consolidated statements with aggregated votes
    //    Reuse the same consensus functions used by the report view model
    //    to avoid duplicated logic and inconsistent key handling.
    const hasConsolidatedData = clusterBuckets.length > 0;

    let consensusItemsForPrompt;
    if (hasConsolidatedData) {
      const bucketsMapped = clusterBuckets.map((b) => ({
        bucketId: b.id,
        consolidatedStatement: b.consolidated_statement,
        responseIds: b.conversation_cluster_bucket_members.map((m) =>
          String(m.response_id)
        ),
      }));

      const unconsolidatedMapped = unconsolidatedRows
        .filter((r) => r.conversation_responses?.[0]?.response_text)
        .map((r) => ({
          responseId: String(r.response_id),
          responseText: r.conversation_responses![0].response_text,
        }));

      consensusItemsForPrompt = computeConsolidatedConsensusItems(
        bucketsMapped,
        unconsolidatedMapped,
        feedbackRowsMapped
      );
    } else {
      consensusItemsForPrompt = computeResponseConsensusItems(
        summaryResponses.map((r) => ({
          id: String(r.id),
          responseText: String(r.response_text ?? ""),
        })),
        feedbackRowsMapped
      );
    }

    // Map consensus items to the prompt format
    const consolidatedStatements: ConsolidatedStatementWithVotes[] =
      consensusItemsForPrompt.map((item) => ({
        id: item.id,
        statement: item.responseText,
        agreeVotes: item.agreeVotes,
        passVotes: item.passVotes,
        disagreeVotes: item.disagreeVotes,
        totalVotes: item.totalVotes,
        agreePercent: item.agreePercent,
        passPercent: item.passPercent,
        disagreePercent: item.disagreePercent,
      }));

    // Sort statements: those with votes first (by total votes desc), then those without
    consolidatedStatements.sort((a, b) => {
      if (a.totalVotes > 0 && b.totalVotes === 0) return -1;
      if (a.totalVotes === 0 && b.totalVotes > 0) return 1;
      return b.totalVotes - a.totalVotes;
    });

    // Categorize statements for the prompt
    const highConsensusStatements = consolidatedStatements.filter(
      (s) => s.totalVotes >= 3 && s.agreePercent >= 70
    );
    const divisiveStatements = consolidatedStatements.filter(
      (s) =>
        s.totalVotes >= 3 &&
        s.agreePercent >= 30 &&
        s.agreePercent <= 60 &&
        s.disagreePercent >= 25
    );
    const lowConsensusStatements = consolidatedStatements.filter(
      (s) => s.totalVotes >= 3 && s.disagreePercent >= 50
    );

    // 10. Build OpenAI prompt focused on consolidated statements
    const themesText = themes
      .map(
        (t) =>
          `Theme ${t.cluster_index}: ${t.name || "Untitled"}\n  Description: ${t.description || "N/A"}\n  Size: ${t.size || 0} responses`
      )
      .join("\n\n");

    const formatStatement = (s: ConsolidatedStatementWithVotes) =>
      `- "${s.statement}"\n  Votes: ${s.agreeVotes} agree (${s.agreePercent}%), ${s.passVotes} pass (${s.passPercent}%), ${s.disagreeVotes} disagree (${s.disagreePercent}%) | Total: ${s.totalVotes} votes`;

    const allStatementsText = consolidatedStatements
      .filter((s) => s.totalVotes > 0)
      .slice(0, 50) // Limit for prompt size
      .map(formatStatement)
      .join("\n\n");

    const highConsensusText =
      highConsensusStatements.length > 0
        ? highConsensusStatements.map(formatStatement).join("\n\n")
        : "No statements have achieved high consensus yet.";

    const divisiveText =
      divisiveStatements.length > 0
        ? divisiveStatements.map(formatStatement).join("\n\n")
        : "No clearly divisive statements identified.";

    const lowConsensusText =
      lowConsensusStatements.length > 0
        ? lowConsensusStatements.map(formatStatement).join("\n\n")
        : "No statements with majority disagreement.";

    const prompt = `Generate an executive summary report for the conversation titled "${conversation.title || "Untitled Conversation"}".

This report should focus on the CONSOLIDATED STATEMENTS from the consensus matrix - these are synthesized viewpoints that represent groups of similar responses, along with the votes they have received.

**Overview:**
- Total responses collected: ${responseCount}
- Total consolidated statements: ${consolidatedStatements.length}
- Statements with votes: ${consolidatedStatements.filter((s) => s.totalVotes > 0).length}
- Themes identified: ${themes.length}

**Themes:**
${themesText || "No themes identified yet."}

**All Consolidated Statements with Votes (Consensus Matrix):**
${allStatementsText || "No voted statements yet."}

**High Consensus Statements (70%+ agreement):**
${highConsensusText}

**Divisive/Contentious Statements (30-60% agree, 25%+ disagree):**
${divisiveText}

**Statements with Majority Disagreement (50%+ disagree):**
${lowConsensusText}

Your task is to analyze this consensus data and produce a comprehensive executive summary report.

IMPORTANT GUIDELINES:
1. Focus primarily on the consolidated statements and their vote distributions
2. High consensus items (70%+ agree) represent clear areas of alignment
3. Divisive items represent topics where the group is split and may need further discussion
4. Use the original response themes only for additional context when helpful
5. Recommendations should be actionable and based on the consensus data

The report MUST be formatted as valid HTML using these EXACT sections:

<h1>Executive Summary</h1>
<p>[2-3 paragraph overview of the conversation, participation levels, and key findings from the consensus data]</p>

<h2>Key Themes</h2>
<p>[Analysis of the main themes that emerged, with context from the consolidated statements]</p>
<ul>
  <li>[Theme with supporting consolidated statements]</li>
</ul>

<h2>Areas of Agreement</h2>
<p>[Identify consolidated statements with strong agreement (70%+). Quote the actual statements and explain their significance.]</p>
<ul>
  <li>[High consensus statement with vote breakdown]</li>
</ul>

<h2>Divisive or Contentious Points</h2>
<p>[Identify consolidated statements where opinions are split. These are important for understanding where further deliberation is needed.]</p>
<ul>
  <li>[Divisive statement with vote breakdown and analysis]</li>
</ul>

<h2>Recommendations</h2>
<p>Based on the consensus analysis, here are actionable recommendations:</p>
<h3>Clear Actions (High Consensus)</h3>
<ol>
  <li>[Specific action based on a high-consensus statement - these can be acted upon with confidence]</li>
</ol>
<h3>Items Requiring Further Deliberation</h3>
<ol>
  <li>[Topic that needs more discussion or an explicit vote due to divided opinions]</li>
</ol>

Output ONLY the HTML content. Do not include markdown code fences, explanations, or apologies. Start directly with the HTML tags.`;

    // 10. Call OpenAI (using environment variable for API key)
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return jsonError("OpenAI API key not configured", 500);
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an expert at synthesizing conversation data into executive summaries. You always output valid HTML without any markdown formatting, code fences, or explanations. You respond only with the requested HTML content.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!openaiResponse.ok) {
      console.error("[POST report] OpenAI error:", await openaiResponse.text());
      return jsonError("Failed to generate report with AI", 500);
    }

    const openaiData = await openaiResponse.json();
    let reportHtml = openaiData.choices?.[0]?.message?.content || "";

    if (!reportHtml) {
      return jsonError("AI generated empty report", 500);
    }

    // Clean up the response: remove markdown code fences and trim whitespace
    reportHtml = reportHtml
      .replace(/^```html\s*/i, "") // Remove opening ```html
      .replace(/^```\s*/m, "") // Remove opening ```
      .replace(/\s*```\s*$/m, "") // Remove closing ```
      .trim();

    // If the response doesn't contain HTML tags, convert plain text to HTML
    if (!reportHtml.includes("<h1>") && !reportHtml.includes("<h2>")) {
      // Split into lines and convert to HTML
      const lines = reportHtml.split("\n");
      const htmlLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line) {
          continue; // Skip empty lines
        }

        // Detect section headers based on content
        if (line.toLowerCase().includes("executive summary") && i === 0) {
          htmlLines.push(`<h1>${line}</h1>`);
        } else if (
          line.toLowerCase().includes("key themes") ||
          line.toLowerCase().includes("areas of agreement") ||
          line.toLowerCase().includes("divisive") ||
          line.toLowerCase().includes("contentious") ||
          line.toLowerCase().includes("recommendations")
        ) {
          htmlLines.push(`<h2>${line}</h2>`);
        } else if (line.match(/^\d+\./)) {
          // Numbered list item
          const content = line.replace(/^\d+\.\s*/, "");
          if (!htmlLines[htmlLines.length - 1]?.startsWith("<ol>")) {
            htmlLines.push("<ol>");
          }
          htmlLines.push(`<li>${content}</li>`);
        } else if (line.startsWith("- ") || line.startsWith("• ")) {
          // Bullet list item
          const content = line.replace(/^[-•]\s*/, "");
          if (!htmlLines[htmlLines.length - 1]?.startsWith("<ul>")) {
            htmlLines.push("<ul>");
          }
          htmlLines.push(`<li>${content}</li>`);
        } else {
          // Close any open lists
          if (htmlLines[htmlLines.length - 1] === "</li>") {
            const lastTag = htmlLines[htmlLines.length - 2];
            if (lastTag?.includes("<ol>") || lastTag?.includes("<ul>")) {
              htmlLines.push(lastTag.includes("<ol>") ? "</ol>" : "</ul>");
            }
          }
          // Regular paragraph
          htmlLines.push(`<p>${line}</p>`);
        }
      }

      // Close any unclosed lists
      if (htmlLines[htmlLines.length - 1] === "</li>") {
        const listType = htmlLines.find((l) => l.startsWith("<ol>") || l.startsWith("<ul>"));
        if (listType) {
          htmlLines.push(listType.includes("<ol>") ? "</ol>" : "</ul>");
        }
      }

      reportHtml = htmlLines.join("\n");
    }

    // 11. Determine next version number
    const latestVersionResult = await supabase
      .from("conversation_reports")
      .select("version")
      .eq("conversation_id", conversationId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestVersionResult) {
      return jsonError("Failed to fetch report version", 500);
    }

    const { data: latestVersion, error: latestVersionError } = latestVersionResult;
    if (latestVersionError) {
      return jsonError("Failed to fetch report version", 500);
    }

    const nextVersion = (latestVersion?.version || 0) + 1;

    // 12. Insert new report version
    const insertResult = await supabase
      .from("conversation_reports")
      .insert({
        conversation_id: conversationId,
        version: nextVersion,
        html: reportHtml,
        created_by: session.user.id,
      })
      .select("version, html, created_at")
      .maybeSingle();

    if (!insertResult) {
      return jsonError("Failed to save report", 500);
    }

    const { data: newReport, error: insertError } = insertResult;
    if (insertError || !newReport) {
      console.error("[POST report] Insert error:", insertError);
      return jsonError("Failed to save report", 500);
    }

    // 13. Update conversation.report_json with latest HTML
    await supabase
      .from("conversations")
      .update({ report_json: reportHtml })
      .eq("id", conversationId);

    // 14. Optionally advance phase if gate says "advance"
    if (gate.reason === "advance" && conversation.phase !== "report_open") {
      await supabase
        .from("conversations")
        .update({ phase: "report_open" })
        .eq("id", conversationId);
    }

    // 15. Return new report (+ refreshed agreement/divisive summaries and consensus items)
    const agreementSummaries = computeAgreementSummaries(
      summaryResponses.map((r) => ({
        id: String(r.id),
        responseText: String(r.response_text ?? ""),
      })),
      feedbackRowsMapped,
      { maxPerType: 100 }
    );

    // Reuse the consensus items already computed for the prompt
    const consensusItems = consensusItemsForPrompt;

    const totalInteractionsResult = await supabase
      .from("response_feedback")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    const totalInteractions = totalInteractionsResult?.count || 0;

    return NextResponse.json({
      report: newReport.html,
      version: newReport.version,
      createdAt: newReport.created_at,
      agreementSummaries,
      consensusItems,
      totalInteractions,
    });
  } catch (error) {
    console.error("[POST report] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
