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

    // Fetch understand conversations
    let query = supabase
      .from("conversations")
      .select("id, title, analysis_status")
      .eq("hive_id", hiveId)
      .eq("type", "understand")
      .order("created_at", { ascending: false });

    if (status === "ready") {
      query = query.eq("analysis_status", "ready");
    }

    const { data: conversations, error: convError } = await query;

    if (convError) {
      console.error("[GET /api/hives/[hiveId]/understand-sessions] Conv query error:", convError);
      return jsonError("Failed to fetch sessions", 500, "DATABASE_ERROR");
    }

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ sessions: [] });
    }

    const conversationIds = conversations.map((c) => c.id);

    // Fetch cluster buckets with their first member response for all conversations
    const { data: buckets, error: bucketsError } = await supabase
      .from("conversation_cluster_buckets")
      .select(`
        id,
        conversation_id,
        conversation_cluster_bucket_members(response_id)
      `)
      .in("conversation_id", conversationIds);

    if (bucketsError) {
      console.error("[GET /api/hives/[hiveId]/understand-sessions] Buckets query error:", bucketsError);
      // Continue without bucket data - just show 0 for counts
    }

    // Fetch feedback to calculate voting coverage
    const { data: feedback } = await supabase
      .from("conversation_response_feedback")
      .select("conversation_id, response_id")
      .in("conversation_id", conversationIds);

    // Build maps for efficient lookup
    const bucketsByConv = new Map<string, Array<{ id: string; firstResponseId: string | null }>>();
    (buckets || []).forEach((b) => {
      if (!bucketsByConv.has(b.conversation_id)) {
        bucketsByConv.set(b.conversation_id, []);
      }
      const members = b.conversation_cluster_bucket_members as Array<{ response_id: string }> | null;
      const firstResponseId = members?.[0]?.response_id ?? null;
      bucketsByConv.get(b.conversation_id)!.push({ id: b.id, firstResponseId });
    });

    const votedResponsesByConv = new Map<string, Set<string>>();
    (feedback || []).forEach((fb) => {
      if (!votedResponsesByConv.has(fb.conversation_id)) {
        votedResponsesByConv.set(fb.conversation_id, new Set());
      }
      votedResponsesByConv.get(fb.conversation_id)!.add(String(fb.response_id));
    });

    // Build response
    const sessions = conversations.map((conv) => {
      const convBuckets = bucketsByConv.get(conv.id) || [];
      const statementCount = convBuckets.length;

      const votedResponses = votedResponsesByConv.get(conv.id) || new Set();
      let statementsWithVotes = 0;

      for (const bucket of convBuckets) {
        if (bucket.firstResponseId && votedResponses.has(bucket.firstResponseId)) {
          statementsWithVotes++;
        }
      }

      const votingCoverage = statementCount > 0
        ? Math.round((statementsWithVotes / statementCount) * 100)
        : 0;

      return {
        id: conv.id,
        title: conv.title || "Untitled",
        clusterCount: 0, // Not needed for display anymore
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
