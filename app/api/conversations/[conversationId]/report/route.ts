/**
 * Conversation Report API Route
 *
 * POST - Generate a new report version using Claude Sonnet 4
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
import { getAnthropicClient } from "@/lib/ai/anthropic";

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

interface ResponseRow {
  id: number;
  response_text: string;
  tag: string | null;
  cluster_index: number | null;
}

/**
 * Sample up to `maxSamples` responses, distributed proportionally across themes.
 * Responses without a theme are included in a catch-all bucket.
 */
function sampleResponsesAcrossThemes(
  responses: ResponseRow[],
  maxSamples: number
): ResponseRow[] {
  if (responses.length <= maxSamples) return responses;

  // Group by cluster_index
  const buckets = new Map<number | null, ResponseRow[]>();
  for (const r of responses) {
    const key = r.cluster_index;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  const result: ResponseRow[] = [];
  const bucketEntries = [...buckets.entries()];

  // Allocate proportionally, minimum 1 per bucket
  let remaining = maxSamples;
  const allocations = bucketEntries.map(([, items]) => {
    const share = Math.max(1, Math.round((items.length / responses.length) * maxSamples));
    return Math.min(share, items.length);
  });

  // Adjust if over budget
  const total = allocations.reduce((a, b) => a + b, 0);
  if (total > maxSamples) {
    const scale = maxSamples / total;
    for (let i = 0; i < allocations.length; i++) {
      allocations[i] = Math.max(1, Math.floor(allocations[i] * scale));
    }
  }

  for (let i = 0; i < bucketEntries.length; i++) {
    const items = bucketEntries[i][1];
    const count = Math.min(allocations[i], remaining);
    // Take evenly spaced samples
    const step = items.length / count;
    for (let j = 0; j < count; j++) {
      result.push(items[Math.floor(j * step)]);
    }
    remaining -= count;
    if (remaining <= 0) break;
  }

  return result;
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
        .order("created_at", { ascending: false }),

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

    // 10. Build prompt data for Claude Sonnet 4
    const responses = responsesResult.data || [];

    const themesText = themes
      .map(
        (t) =>
          `- ${t.name || "Untitled"}: ${t.description || "N/A"} (${t.size || 0} responses)`
      )
      .join("\n");

    const formatStatement = (s: ConsolidatedStatementWithVotes) =>
      `- "${s.statement}"\n  Votes: ${s.agreeVotes} agree (${s.agreePercent}%), ${s.passVotes} pass (${s.passPercent}%), ${s.disagreeVotes} disagree (${s.disagreePercent}%) | Total: ${s.totalVotes} votes`;

    const allStatementsText = consolidatedStatements
      .map(formatStatement)
      .join("\n\n");

    // Sample up to 50 raw responses, distributed proportionally across themes
    const sampleResponses = sampleResponsesAcrossThemes(responses, 50);
    const sampleResponsesText = sampleResponses
      .map((r) => `- "${r.response_text}"`)
      .join("\n");

    // Compute participant stats for the prompt
    const totalParticipants = new Set([
      ...responses.map((r: { id: number }) => r.id),
      ...feedbackRows.map((r) => r.response_id),
    ]).size;
    const uniqueVoters = new Set(feedbackRows.map((r) => r.response_id)).size;
    const totalStatements = consolidatedStatements.length;
    const statementsWithVotes = consolidatedStatements.filter(
      (s) => s.totalVotes > 0
    ).length;
    const totalVotesCast = consolidatedStatements.reduce(
      (sum, s) => sum + s.totalVotes,
      0
    );
    const maxPossibleVotes = uniqueVoters * totalStatements;
    const voteCoveragePercent =
      maxPossibleVotes > 0
        ? Math.round((totalVotesCast / maxPossibleVotes) * 100)
        : 0;

    const userMessage = `# Conversation: ${conversation.title || "Untitled Conversation"}

## Participants
- ${totalParticipants} total participants
- ${uniqueVoters} voted on statements
- ${totalStatements} consolidated statements (${statementsWithVotes} with votes)
- ${voteCoveragePercent}% vote coverage

## Themes
${themesText || "No themes identified."}

## Consolidated Statements with Votes
${allStatementsText || "No statements yet."}

## Sample of Participant Responses
${sampleResponsesText || "No responses available."}

---

Write a narrative executive summary of this conversation for its participants.
Do not simply list statements — synthesise, draw connections, and explain
what the collective voice is saying.

Structure the document with the following sections (using HTML headings):
1. Executive Summary — a concise overview of the conversation, participation, and headline findings
2. Key Themes — the main themes that emerged, with narrative connecting them
3. Areas of Agreement — where participants aligned, grounded in vote data
4. Areas of Contention — where opinions were divided, exploring the nature of the disagreement
5. Recommended Next Steps — actionable suggestions for what the group should do next on the platform. Consider recommending:
   - Creating a "decision space" conversation to vote on specific proposals drawn from high-consensus or contentious statements
   - Running a follow-up "understand" conversation to explore a divisive or under-explored topic in more depth
   - Acting on clear areas of agreement that don't need further discussion
   Be specific about which statements or themes each recommendation relates to.

Use whatever writing style best communicates each point — narrative prose, lists, or a mix.
Reference specific vote data to support your points (e.g. "78% agreed that...").`;

    // 11. Call Claude Sonnet 4
    let anthropic;
    try {
      anthropic = getAnthropicClient();
    } catch {
      return jsonError("Anthropic API key not configured", 500);
    }

    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      temperature: 0.4,
      system:
        "You are a skilled analyst writing for participants of a collective conversation. Your role is to help them understand what the group collectively expressed. Write in a natural narrative style — not a list of results, but a cohesive document that synthesises findings, draws connections between themes, and surfaces meaningful insights. Use a neutral, evidence-grounded tone that shifts to empathetic warmth when discussing points of genuine concern or division. Always reference specific vote data to support your narrative (e.g. \"78% agreed that...\"). Output valid HTML only — no markdown, no code fences, no preamble. Scale the depth and length of your writing to match the complexity of the data: a small simple conversation warrants a focused summary, a large complex one warrants deeper analysis.",
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const textBlock = aiResponse.content.find((block) => block.type === "text");
    let reportHtml = textBlock?.text || "";

    if (!reportHtml) {
      return jsonError("AI generated empty report", 500);
    }

    // Clean up: remove markdown code fences if present
    reportHtml = reportHtml
      .replace(/^```html\s*/i, "")
      .replace(/^```\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

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
