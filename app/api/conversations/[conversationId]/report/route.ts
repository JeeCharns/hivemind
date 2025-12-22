/**
 * Conversation Report API Route
 *
 * POST - Generate a new report version using OpenAI
 * Requires authentication, admin role, and sufficient responses
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveAdmin } from "@/lib/conversations/server/requireHiveAdmin";
import { canOpenReport } from "@/lib/conversations/domain/reportRules";
import { MIN_RESPONSES_FOR_REPORT } from "@/lib/conversations/domain/reportRules";
import { jsonError } from "@/lib/api/errors";
import { computeAgreementSummaries } from "@/lib/conversations/domain/agreementSummaries";
import { computeResponseConsensusItems } from "@/lib/conversations/domain/responseConsensus";

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

    // 3. Verify admin membership
    try {
      await requireHiveAdmin(supabase, session.user.id, conversation.hive_id);
    } catch {
      return jsonError("Unauthorized: Admin access required", 403);
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

    // 7. Fetch themes and responses for prompt building
    const [
      themesResult,
      responsesResult,
      feedbackResult,
      summaryResponsesResult,
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
    const responses = responsesResult.data || [];
    const feedbackRows = feedbackResult.data || [];
    const summaryResponses = summaryResponsesResult.data || [];

    // 8. Build feedback summary
    const feedbackCounts = new Map<
      string,
      { agree: number; pass: number; disagree: number }
    >();

    responses.forEach((r) => {
      feedbackCounts.set(r.id, { agree: 0, pass: 0, disagree: 0 });
    });

    feedbackRows.forEach((fb) => {
      const counts = feedbackCounts.get(fb.response_id);
      if (counts) {
        if (fb.feedback === "agree") {
          counts.agree++;
        } else if (fb.feedback === "pass") {
          counts.pass++;
        } else if (fb.feedback === "disagree") {
          counts.disagree++;
        }
      }
    });

    // 9. Build OpenAI prompt
    const themesText = themes
      .map(
        (t) =>
          `Theme ${t.cluster_index}: ${t.name || "Untitled"}\n  Description: ${t.description || "N/A"}\n  Size: ${t.size || 0} responses`
      )
      .join("\n\n");

    const responsesText = responses
      .slice(0, 50) // Top 50 for prompt
      .map((r) => {
        const counts = feedbackCounts.get(r.id);
        return `- [${r.tag || "untagged"}] ${r.response_text}\n  Feedback: ${counts?.agree || 0} agree, ${counts?.pass || 0} pass, ${counts?.disagree || 0} disagree`;
      })
      .join("\n\n");

    const prompt = `Generate an executive summary report for the conversation titled "${conversation.title || "Untitled Conversation"}".

The conversation has ${responseCount} total responses organized into ${themes.length} themes.

**Themes:**
${themesText}

**Sample Responses with Feedback:**
${responsesText}

Your task is to analyze this data and produce a comprehensive executive summary report.

The report MUST be formatted as valid HTML using these sections:

<h1>Executive Summary</h1>
<p>[Opening paragraph summarizing the conversation]</p>

<h2>Key Themes</h2>
<p>[Analysis of the ${themes.length} main themes]</p>
<ul>
  <li>[Theme details]</li>
</ul>

<h2>Areas of Agreement</h2>
<p>[Identify responses with strong agreement based on feedback counts]</p>

<h2>Divisive or Contentious Points</h2>
<p>[Identify responses with disagreement or mixed feedback]</p>

<h2>Recommendations</h2>
<ol>
  <li>[Actionable recommendation 1]</li>
  <li>[Actionable recommendation 2]</li>
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

    // 15. Return new report (+ refreshed agreement/divisive summaries)
    const agreementSummaries = computeAgreementSummaries(
      summaryResponses.map((r) => ({
        id: String(r.id),
        responseText: String(r.response_text ?? ""),
      })),
      feedbackRows.map((r) => ({
        responseId: String(r.response_id),
        feedback: String(r.feedback),
      })),
      { maxPerType: 100 }
    );

    const consensusItems = computeResponseConsensusItems(
      summaryResponses.map((r) => ({
        id: String(r.id),
        responseText: String(r.response_text ?? ""),
      })),
      feedbackRows.map((r) => ({
        responseId: String(r.response_id),
        feedback: String(r.feedback),
      }))
    );

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
