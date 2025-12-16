/**
 * Conversation Analysis Status API Route
 *
 * GET - Get analysis status for a conversation
 * Allows UI to poll/refresh without full page reload
 * Requires authentication and hive membership
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { jsonError } from "@/lib/api/errors";

const DEFAULT_THRESHOLD = 20;

export async function GET(
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

    // 2. Get conversation to verify hive membership and analysis status
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id, analysis_status, analysis_error")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 3. Verify membership
    try {
      await requireHiveMember(supabase, session.user.id, conversation.hive_id);
    } catch (_err) {
      return jsonError("Unauthorized: Not a member of this hive", 403);
    }

    // 4. Count responses
    const { count, error: countError } = await supabase
      .from("conversation_responses")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (countError) {
      console.error("[GET analysis-status] Count error:", countError);
      return jsonError("Failed to fetch response count", 500);
    }

    // 5. Return status
    return NextResponse.json({
      analysisStatus: conversation.analysis_status,
      analysisError: conversation.analysis_error,
      responseCount: count ?? 0,
      threshold: DEFAULT_THRESHOLD,
    });
  } catch (error) {
    console.error("[GET analysis-status] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
