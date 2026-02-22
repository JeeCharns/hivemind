/**
 * Guest Understand API
 *
 * GET /api/guest/[token]/understand — returns the full UnderstandViewModel
 *
 * Auth: guest session cookie required.
 * Uses admin client to bypass RLS (guest has no Supabase user).
 *
 * Returns the same UnderstandViewModel shape as the authenticated endpoint
 * so guests can reuse UnderstandView / UnderstandViewContainer components.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { requireGuestSession } from "@/lib/conversations/guest/requireGuestSession";
import type {
  UnderstandViewModel,
  ResponsePoint,
  ThemeRow,
  FeedbackItem,
  FeedbackCounts,
  Feedback,
  ClusterBucket,
} from "@/types/conversation-understand";
import { UNDERSTAND_MIN_RESPONSES } from "@/lib/conversations/domain/thresholds";

export const dynamic = "force-dynamic";

// ── DB row types ──────────────────────────────────────────

interface ResponseRow {
  id: string | number;
  response_text: string;
  tag: string | null;
  cluster_index: number | null;
  x_umap: number | null;
  y_umap: number | null;
}

interface ThemeDbRow {
  cluster_index: number;
  name: string | null;
  description: string | null;
  size: number | null;
}

interface FeedbackRow {
  response_id: string | number;
  feedback: string;
  user_id: string;
}

interface ClusterBucketRow {
  id: string;
  cluster_index: number;
  bucket_name: string;
  bucket_index: number;
  consolidated_statement: string;
  response_count: number;
  conversation_cluster_bucket_members?: Array<{ response_id: string | number }>;
}

interface UnconsolidatedRow {
  response_id: string | number;
}

function parseAnalysisStatus(
  value: unknown
): UnderstandViewModel["analysisStatus"] {
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

    const { adminClient, conversationId, session } = result.ctx;

    // 1. Fetch conversation metadata
    const { data: convo, error: convoErr } = await adminClient
      .from("conversations")
      .select(
        "id, hive_id, analysis_status, analysis_error, analysis_response_count, analysis_updated_at"
      )
      .eq("id", conversationId)
      .single();

    if (convoErr || !convo) {
      return jsonError("Conversation not found", 404);
    }

    // 2. Fetch all data in parallel (mirrors getUnderstandViewModel)
    const [
      responsesResult,
      themesResult,
      feedbackResult,
      countResult,
      bucketsResult,
      unconsolidatedResult,
    ] = await Promise.all([
      adminClient
        .from("conversation_responses")
        .select("id, response_text, tag, cluster_index, x_umap, y_umap")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false }),

      adminClient
        .from("conversation_themes")
        .select("cluster_index, name, description, size")
        .eq("conversation_id", conversationId)
        .order("cluster_index", { ascending: true }),

      adminClient
        .from("response_feedback")
        .select("response_id, feedback, user_id")
        .eq("conversation_id", conversationId),

      adminClient
        .from("conversation_responses")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId),

      adminClient
        .from("conversation_cluster_buckets")
        .select(
          `
          id,
          cluster_index,
          bucket_name,
          bucket_index,
          consolidated_statement,
          response_count,
          conversation_cluster_bucket_members(response_id)
        `
        )
        .eq("conversation_id", conversationId)
        .order("cluster_index", { ascending: true })
        .order("bucket_index", { ascending: true }),

      adminClient
        .from("conversation_unconsolidated_responses")
        .select("response_id")
        .eq("conversation_id", conversationId),
    ]);

    if (responsesResult.error) {
      return jsonError("Failed to fetch responses", 500);
    }
    if (themesResult.error) {
      return jsonError("Failed to fetch themes", 500);
    }
    if (feedbackResult.error) {
      return jsonError("Failed to fetch feedback", 500);
    }

    const responses = (responsesResult.data || []) as ResponseRow[];
    const themes = (themesResult.data || []) as ThemeDbRow[];
    const feedbackRows = (feedbackResult.data || []) as FeedbackRow[];
    const responseCount = countResult.count ?? 0;
    const bucketsData = (bucketsResult.data || []) as ClusterBucketRow[];
    const unconsolidatedData = (unconsolidatedResult.data ||
      []) as UnconsolidatedRow[];

    // Normalise IDs to strings
    const normalised = responses.map((r) => ({ ...r, id: String(r.id) }));

    // 3. Staleness metadata
    const analysisResponseCount = convo.analysis_response_count;
    const analysedCount = analysisResponseCount ?? 0;
    const newResponsesSinceAnalysis = Math.max(
      0,
      responseCount - analysedCount
    );
    const isAnalysisStale =
      convo.analysis_status === "ready" && analysedCount < responseCount;

    // 4. Build ResponsePoint[]
    const responsePoints: ResponsePoint[] = normalised.map((r) => ({
      id: r.id,
      responseText: r.response_text,
      tag: r.tag,
      clusterIndex: r.cluster_index,
      xUmap: r.x_umap,
      yUmap: r.y_umap,
    }));

    // 5. Build ThemeRow[]
    const themeRows: ThemeRow[] = themes.map((t) => ({
      clusterIndex: t.cluster_index,
      name: t.name,
      description: t.description,
      size: t.size,
    }));

    // 6. Aggregate feedback — use guestSessionId to identify "current user"
    const guestSessionId = session.guestSessionId;
    const feedbackByResponse = new Map<
      string,
      { counts: FeedbackCounts; current: Feedback | null }
    >();

    normalised.forEach((r) => {
      feedbackByResponse.set(r.id, {
        counts: { agree: 0, pass: 0, disagree: 0 },
        current: null,
      });
    });

    feedbackRows.forEach((fb) => {
      const existing = feedbackByResponse.get(String(fb.response_id));
      if (!existing) return;

      const feedbackType = fb.feedback as Feedback;
      if (
        feedbackType === "agree" ||
        feedbackType === "pass" ||
        feedbackType === "disagree"
      ) {
        existing.counts[feedbackType]++;
      }

      // Guest feedback uses guest_session_id instead of user_id.
      // The system import user UUID is shared — we cannot use user_id here.
      // Instead, we look up guest feedback separately below.
    });

    // Look up this guest's feedback separately so we can highlight their votes
    const { data: guestFbRows } = await adminClient
      .from("response_feedback")
      .select("response_id, feedback")
      .eq("conversation_id", conversationId)
      .eq("guest_session_id", guestSessionId);

    (guestFbRows ?? []).forEach(
      (row: { response_id: string | number; feedback: string }) => {
        const existing = feedbackByResponse.get(String(row.response_id));
        if (existing) {
          existing.current = row.feedback as Feedback;
        }
      }
    );

    // 7. Build FeedbackItem[]
    const feedbackItems: FeedbackItem[] = normalised.map((r) => {
      const fb = feedbackByResponse.get(r.id)!;
      return {
        id: r.id,
        responseText: r.response_text,
        tag: r.tag,
        clusterIndex: r.cluster_index,
        counts: fb.counts,
        current: fb.current,
      };
    });

    // 8. Build ClusterBucket[]
    const clusterBuckets: ClusterBucket[] = bucketsData.map((bucket) => {
      const memberIds = (bucket.conversation_cluster_bucket_members || []).map(
        (m) => String(m.response_id)
      );
      return {
        bucketId: String(bucket.id),
        clusterIndex: bucket.cluster_index,
        bucketName: bucket.bucket_name,
        consolidatedStatement: bucket.consolidated_statement,
        responses: [],
        responseIds: memberIds,
        responseCount: bucket.response_count,
      };
    });

    // 9. Unconsolidated IDs
    const unconsolidatedResponseIds = unconsolidatedData.map((r) =>
      String(r.response_id)
    );

    // 10. Assemble view model
    const viewModel: UnderstandViewModel = {
      conversationId,
      responses: responsePoints,
      themes: themeRows,
      feedbackItems,
      clusterBuckets,
      unconsolidatedResponseIds,
      analysisStatus: parseAnalysisStatus(convo.analysis_status),
      analysisError: convo.analysis_error,
      responseCount,
      threshold: UNDERSTAND_MIN_RESPONSES,
      analysisResponseCount,
      analysisUpdatedAt: convo.analysis_updated_at,
      newResponsesSinceAnalysis,
      isAnalysisStale,
    };

    return NextResponse.json(viewModel);
  } catch (err) {
    console.error("[GET guest/understand]", err);
    return jsonError("Internal server error", 500);
  }
}
