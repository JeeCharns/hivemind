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

    // Build query for understand conversations
    let query = supabase
      .from("conversations")
      .select(`
        id,
        title,
        created_at,
        analysis_status,
        conversation_cluster_buckets(count)
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

    // Transform to expected format
    const sessions = (conversations || []).map((conv) => ({
      id: conv.id,
      title: conv.title || "Untitled",
      clusterCount: Array.isArray(conv.conversation_cluster_buckets)
        ? conv.conversation_cluster_buckets.length
        : (conv.conversation_cluster_buckets as { count: number })?.count || 0,
      date: conv.created_at,
    }));

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[GET /api/hives/[hiveId]/understand-sessions]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonError(message, 500, "INTERNAL_ERROR");
  }
}
