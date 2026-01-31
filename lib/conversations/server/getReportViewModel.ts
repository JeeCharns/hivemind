/**
 * Get Report View Model - Server Data Assembly
 *
 * Fetches and assembles all data needed for the Result/Report tab
 * Follows SRP: single function to build complete view model
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ResultViewModel,
  ReportVersion,
  ReportContent,
  ConsensusMetrics,
} from "@/types/conversation-report";
import { requireHiveMember } from "./requireHiveMember";
import { canOpenReport, canGenerateReport } from "../domain/reportRules";
import { computeAgreementSummaries } from "../domain/agreementSummaries";
import {
  computeResponseConsensusItems,
  computeConsolidatedConsensusItems,
} from "../domain/responseConsensus";

interface ReportRow {
  version: number;
  html: string;
  created_at: string | null;
}

interface ReportResponseRow {
  id: string | number;
  response_text: string;
  user_id: string;
}

interface ReportFeedbackRow {
  response_id: string | number;
  feedback: string;
  user_id: string;
}

interface ClusterBucketRow {
  id: string;
  consolidated_statement: string;
  conversation_cluster_bucket_members: Array<{ response_id: number }>;
}

interface UnconsolidatedResponseRow {
  response_id: number;
  conversation_responses: { response_text: string }[] | null;
}

function parseAnalysisStatus(
  value: unknown
): "not_started" | "embedding" | "analyzing" | "ready" | "error" | null {
  switch (value) {
    case "not_started":
    case "embedding":
    case "analyzing":
    case "ready":
    case "error":
    case null:
      return value;
    default:
      return null;
  }
}

/**
 * Assembles the complete Report view model
 *
 * @param supabase - Supabase client with service role
 * @param conversationId - Conversation UUID
 * @param userId - Current user's UUID
 * @returns Complete view model with report, versions, and gating
 */
export async function getReportViewModel(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<ResultViewModel> {
  // 1. Fetch conversation
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select(
      "id, hive_id, type, phase, analysis_status, analysis_error, report_json, title"
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found");
  }

  // 2. Verify membership
  await requireHiveMember(supabase, userId, conversation.hive_id);

  // 3. User is already verified as member (requireHiveMember above)
  const isMember = true;

  // 4. Fetch data in parallel
  const [
    versionsResult,
    responseCountResult,
    responsesResult,
    feedbackResult,
    feedbackCountResult,
    clusterBucketsResult,
    unconsolidatedResult,
  ] = await Promise.all([
    // Fetch report versions
    supabase
      .from("conversation_reports")
      .select("version, html, created_at")
      .eq("conversation_id", conversationId)
      .order("version", { ascending: false }),

    // Count responses
    supabase
      .from("conversation_responses")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId),

    // Fetch responses for agreement/divisive summaries (include user_id for participant count)
    supabase
      .from("conversation_responses")
      .select("id, response_text, user_id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }),

    // Fetch feedback for agreement/divisive summaries (include user_id for voter count)
    supabase
      .from("response_feedback")
      .select("response_id, feedback, user_id")
      .eq("conversation_id", conversationId),

    // Count total votes (all responses)
    supabase
      .from("response_feedback")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId),

    // Fetch cluster buckets with their member response IDs
    supabase
      .from("conversation_cluster_buckets")
      .select("id, consolidated_statement, conversation_cluster_bucket_members(response_id)")
      .eq("conversation_id", conversationId),

    // Fetch unconsolidated responses with their text
    supabase
      .from("conversation_unconsolidated_responses")
      .select("response_id, conversation_responses(response_text)")
      .eq("conversation_id", conversationId),
  ]);

  if (versionsResult.error) {
    throw new Error("Failed to fetch report versions");
  }

  if (responseCountResult.error) {
    throw new Error("Failed to count responses");
  }

  if (responsesResult.error) {
    throw new Error("Failed to fetch responses");
  }

  if (feedbackResult.error) {
    throw new Error("Failed to fetch feedback");
  }

  if (feedbackCountResult.error) {
    throw new Error("Failed to count feedback");
  }

  // Note: cluster buckets and unconsolidated queries may return empty if no consolidation has run
  // This is expected for older conversations or those without analysis

  const reportRows = (versionsResult.data || []) as ReportRow[];
  const responseCount = responseCountResult.count || 0;
  const totalInteractions = feedbackCountResult.count || 0;
  const clusterBuckets = (clusterBucketsResult.data || []) as ClusterBucketRow[];
  const unconsolidatedRows = (unconsolidatedResult.data || []) as UnconsolidatedResponseRow[];

  // 5. Build versions list
  const versions: ReportVersion[] = reportRows.map((row) => ({
    version: row.version,
    createdAt: row.created_at,
    html: row.html,
  }));

  // 6. Determine report content (latest version or report_json)
  let report: ReportContent = null;
  if (versions.length > 0) {
    report = versions[0].html;
  } else if (conversation.report_json) {
    report = conversation.report_json as ReportContent;
  }

  // 7. Compute gate and canGenerate
  const gate = canOpenReport(conversation.phase, responseCount);

  const canGenerate = canGenerateReport(
    isMember,
    conversation.type,
    conversation.analysis_status,
    gate
  );

  const responses = (responsesResult.data || []) as ReportResponseRow[];
  const feedbackRows = (feedbackResult.data || []) as ReportFeedbackRow[];

  const feedbackRowsMapped = feedbackRows.map((r) => ({
    responseId: String(r.response_id),
    feedback: r.feedback,
  }));

  // Determine if we should use consolidated statements or individual responses
  // Use consolidated if cluster buckets exist (new system)
  const hasConsolidatedData = clusterBuckets.length > 0;

  let consensusItems;
  if (hasConsolidatedData) {
    // Use consolidated statements (buckets) + unconsolidated responses
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

    consensusItems = computeConsolidatedConsensusItems(
      bucketsMapped,
      unconsolidatedMapped,
      feedbackRowsMapped
    );
  } else {
    // Fallback to individual responses (legacy behavior)
    consensusItems = computeResponseConsensusItems(
      responses.map((r) => ({
        id: String(r.id),
        responseText: r.response_text,
      })),
      feedbackRowsMapped
    );
  }

  const agreementSummaries = computeAgreementSummaries(
    responses.map((r) => ({
      id: String(r.id),
      responseText: r.response_text,
    })),
    feedbackRowsMapped,
    { maxPerType: 100 }
  );

  // 8. Compute consensus metrics
  // Total participants = unique users who participated (submitted responses OR voted)
  const uniqueRespondentIds = new Set(responses.map((r) => r.user_id));
  const uniqueVoterIds = new Set(feedbackRows.map((r) => r.user_id));
  const uniqueParticipantIds = new Set([...uniqueRespondentIds, ...uniqueVoterIds]);
  const totalParticipants = uniqueParticipantIds.size;

  // Unique voters = unique users who voted on at least one statement
  const uniqueVoters = uniqueVoterIds.size;

  // Total statements in the matrix
  const totalStatements = consensusItems.length;

  // Total votes
  const totalVotes = totalInteractions;

  // % of participants who have voted on at least one statement
  const participantVotingPercent =
    totalParticipants > 0
      ? Math.round((uniqueVoters / totalParticipants) * 100)
      : 0;

  // Vote coverage = (total votes / (voters * statements)) * 100
  // Use uniqueVoters (not totalParticipants) because voters may not have submitted responses
  const maxPossibleVotes = uniqueVoters * totalStatements;
  const voteCoveragePercent =
    maxPossibleVotes > 0
      ? Math.round((totalVotes / maxPossibleVotes) * 100)
      : 0;

  const consensusMetrics: ConsensusMetrics = {
    totalVotes,
    totalParticipants,
    uniqueVoters,
    totalStatements,
    participantVotingPercent,
    voteCoveragePercent,
  };

  // 9. Return view model
  return {
    conversationId: conversation.id,
    report,
    versions,
    responseCount,
    totalInteractions,
    canGenerate,
    gateReason: gate.allowed ? null : gate.reason,
    agreementSummaries,
    consensusItems,
    consensusMetrics,
    analysisStatus: parseAnalysisStatus(conversation.analysis_status),
    analysisError: conversation.analysis_error,
  };
}
