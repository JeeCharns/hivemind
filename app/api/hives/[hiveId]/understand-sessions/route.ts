/**
 * GET /api/hives/[hiveId]/understand-sessions
 *
 * Fetch understand sessions that are ready for use as decision space sources
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { jsonError } from "@/lib/api/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;
    const { hiveId } = await params;

    const supabase = await supabaseServerClient();

    // Verify user is a member of the hive
    const { data: membership } = await supabase
      .from("hive_members")
      .select("role")
      .eq("hive_id", hiveId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return jsonError("Not a member of this hive", 403, "FORBIDDEN");
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // 'ready' to filter by analysis_status

    // Build query for understand conversations with cluster buckets and their member response IDs
    let query = supabase
      .from("conversations")
      .select(`
        id,
        title,
        created_at,
        analysis_status,
        conversation_clusters(count),
        conversation_cluster_buckets(
          id,
          conversation_cluster_bucket_members(response_id)
        )
      `)
      .eq("hive_id", hiveId)
      .eq("type", "understand")
      .order("created_at", { ascending: false });

    // Filter by analysis status if requested
    if (status === "ready") {
      query = query.eq("analysis_status", "ready");
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error("[GET /api/hives/[hiveId]/understand-sessions] Query error:", error);
      return jsonError("Failed to fetch sessions", 500, "DATABASE_ERROR");
    }

    // Get all conversation IDs to fetch feedback counts
    const conversationIds = (conversations || []).map((c) => c.id);

    // Fetch all feedback for these conversations to calculate voting coverage
    const { data: allFeedback } = conversationIds.length > 0
      ? await supabase
          .from("conversation_response_feedback")
          .select("conversation_id, response_id")
          .in("conversation_id", conversationIds)
      : { data: [] };

    // Build a map of conversation_id -> Set of response_ids that have votes
    const votedResponsesByConv = new Map<string, Set<string>>();
    (allFeedback || []).forEach((fb) => {
      if (!votedResponsesByConv.has(fb.conversation_id)) {
        votedResponsesByConv.set(fb.conversation_id, new Set());
      }
      votedResponsesByConv.get(fb.conversation_id)!.add(fb.response_id);
    });

    // Transform to expected format
    const sessions = (conversations || []).map((conv) => {
      const buckets = conv.conversation_cluster_buckets as Array<{
        id: string;
        conversation_cluster_bucket_members: Array<{ response_id: string }> | null;
      }> || [];

      const statementCount = buckets.length;

      // Calculate voting coverage: % of statements that have at least one vote
      const votedResponses = votedResponsesByConv.get(conv.id) || new Set();
      let statementsWithVotes = 0;

      for (const bucket of buckets) {
        // A statement has votes if any of its member responses have votes
        // Use the first member response as the representative (that's what votes are cast on)
        const members = bucket.conversation_cluster_bucket_members || [];
        const firstMember = members[0];
        if (firstMember && votedResponses.has(String(firstMember.response_id))) {
          statementsWithVotes++;
        }
      }

      const votingCoverage = statementCount > 0
        ? Math.round((statementsWithVotes / statementCount) * 100)
        : 0;

      // Get cluster count
      const clusterCount = Array.isArray(conv.conversation_clusters)
        ? conv.conversation_clusters.length
        : (conv.conversation_clusters as { count: number } | null)?.count || 0;

      return {
        id: conv.id,
        title: conv.title || "Untitled",
        clusterCount,
        statementCount,
        votingCoverage,
      };
    });

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[GET /api/hives/[hiveId]/understand-sessions]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonError(message, 500, "INTERNAL_ERROR");
  }
}
