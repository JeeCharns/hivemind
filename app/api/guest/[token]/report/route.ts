/**
 * Guest Report API
 *
 * GET /api/guest/[token]/report — returns the full ResultViewModel
 *
 * Auth: guest session cookie required.
 * Read-only — guests cannot trigger report generation.
 * Returns the same ResultViewModel shape as the authenticated endpoint
 * so guests can reuse the ReportView component.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { requireGuestSession } from "@/lib/conversations/guest/requireGuestSession";
import type {
  ResultViewModel,
  ReportVersion,
  ReportContent,
  ConsensusMetrics,
} from "@/types/conversation-report";
import { computeAgreementSummaries } from "@/lib/conversations/domain/agreementSummaries";
import {
  computeResponseConsensusItems,
  computeConsolidatedConsensusItems,
} from "@/lib/conversations/domain/responseConsensus";

export const dynamic = "force-dynamic";

// ── DB row types ──────────────────────────────────────────

interface ReportRow {
  version: number;
  html: string;
  created_at: string | null;
}

interface ResponseRow {
  id: string | number;
  response_text: string;
  user_id: string;
}

interface FeedbackRow {
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
): ResultViewModel["analysisStatus"] {
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const result = await requireGuestSession(token);
    if (!result.ok) return result.error;

    const { adminClient, conversationId } = result.ctx;

    // 1. Fetch conversation metadata
    const { data: conversation, error: convError } = await adminClient
      .from("conversations")
      .select(
        "id, hive_id, type, phase, analysis_status, analysis_error, report_json"
      )
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 2. Fetch all data in parallel (mirrors getReportViewModel)
    const [
      versionsResult,
      responseCountResult,
      responsesResult,
      feedbackResult,
      feedbackCountResult,
      clusterBucketsResult,
      unconsolidatedResult,
    ] = await Promise.all([
      adminClient
        .from("conversation_reports")
        .select("version, html, created_at")
        .eq("conversation_id", conversationId)
        .order("version", { ascending: false }),

      adminClient
        .from("conversation_responses")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId),

      adminClient
        .from("conversation_responses")
        .select("id, response_text, user_id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false }),

      adminClient
        .from("response_feedback")
        .select("response_id, feedback, user_id")
        .eq("conversation_id", conversationId),

      adminClient
        .from("response_feedback")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId),

      adminClient
        .from("conversation_cluster_buckets")
        .select(
          "id, consolidated_statement, conversation_cluster_bucket_members(response_id)"
        )
        .eq("conversation_id", conversationId),

      adminClient
        .from("conversation_unconsolidated_responses")
        .select("response_id, conversation_responses(response_text)")
        .eq("conversation_id", conversationId),
    ]);

    if (versionsResult.error) {
      return jsonError("Failed to fetch report versions", 500);
    }
    if (responseCountResult.error) {
      return jsonError("Failed to count responses", 500);
    }
    if (responsesResult.error) {
      return jsonError("Failed to fetch responses", 500);
    }
    if (feedbackResult.error) {
      return jsonError("Failed to fetch feedback", 500);
    }

    const reportRows = (versionsResult.data || []) as ReportRow[];
    const responseCount = responseCountResult.count || 0;
    const totalInteractions = feedbackCountResult.count || 0;
    const responses = (responsesResult.data || []) as ResponseRow[];
    const feedbackRows = (feedbackResult.data || []) as FeedbackRow[];
    const clusterBuckets = (clusterBucketsResult.data ||
      []) as ClusterBucketRow[];
    const unconsolidatedRows = (unconsolidatedResult.data ||
      []) as UnconsolidatedResponseRow[];

    // 3. Build versions list
    const versions: ReportVersion[] = reportRows.map((row) => ({
      version: row.version,
      createdAt: row.created_at,
      html: row.html,
    }));

    // 4. Determine report content
    let report: ReportContent = null;
    if (versions.length > 0) {
      report = versions[0].html;
    } else if (conversation.report_json) {
      report = conversation.report_json as ReportContent;
    }

    // 5. Build consensus items
    const feedbackRowsMapped = feedbackRows.map((r) => ({
      responseId: String(r.response_id),
      feedback: r.feedback,
    }));

    const hasConsolidatedData = clusterBuckets.length > 0;

    let consensusItems;
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

      consensusItems = computeConsolidatedConsensusItems(
        bucketsMapped,
        unconsolidatedMapped,
        feedbackRowsMapped
      );
    } else {
      consensusItems = computeResponseConsensusItems(
        responses.map((r) => ({
          id: String(r.id),
          responseText: r.response_text,
        })),
        feedbackRowsMapped
      );
    }

    // 6. Compute agreement summaries
    const agreementSummaries = computeAgreementSummaries(
      responses.map((r) => ({
        id: String(r.id),
        responseText: r.response_text,
      })),
      feedbackRowsMapped,
      { maxPerType: 100 }
    );

    // 7. Compute consensus metrics
    const uniqueRespondentIds = new Set(responses.map((r) => r.user_id));
    const uniqueVoterIds = new Set(feedbackRows.map((r) => r.user_id));
    const uniqueParticipantIds = new Set([
      ...uniqueRespondentIds,
      ...uniqueVoterIds,
    ]);
    const totalParticipants = uniqueParticipantIds.size;
    const uniqueVoters = uniqueVoterIds.size;
    const totalStatements = consensusItems.length;
    const totalVotes = totalInteractions;

    const participantVotingPercent =
      totalParticipants > 0
        ? Math.round((uniqueVoters / totalParticipants) * 100)
        : 0;

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

    // 8. Assemble view model — guests cannot generate reports
    const viewModel: ResultViewModel = {
      conversationId,
      report,
      versions,
      responseCount,
      totalInteractions,
      canGenerate: false,
      gateReason: null,
      agreementSummaries,
      consensusItems,
      consensusMetrics,
      analysisStatus: parseAnalysisStatus(conversation.analysis_status),
      analysisError: conversation.analysis_error,
    };

    return NextResponse.json(viewModel);
  } catch (err) {
    console.error("[GET guest/report]", err);
    return jsonError("Internal server error", 500);
  }
}
