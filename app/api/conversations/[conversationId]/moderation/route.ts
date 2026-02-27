/**
 * Moderation History API Route
 *
 * GET - Fetch moderation history for a conversation
 * Requires authentication and hive membership
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import type {
  ModerationLogEntry,
  ModerationHistoryResponse,
  ModerationAction,
  ModerationFlag,
} from "@/types/moderation";

type RouteParams = { conversationId: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { conversationId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Get conversation to find hive_id
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError) {
      console.error("[GET moderation] Conversation fetch error:", convError);
      return jsonError("Failed to fetch conversation", 500);
    }

    if (!conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 3. Verify membership access (not admin required)
    try {
      await requireHiveMember(supabase, session.user.id, conversation.hive_id);
    } catch {
      return jsonError("Unauthorised: Not a member of this hive", 403);
    }

    // 4. Fetch moderation log entries with response and admin profile
    const { data: logs, error: logsError } = await supabase
      .from("response_moderation_log")
      .select(
        `
        id,
        response_id,
        action,
        flag,
        performed_at,
        performed_by,
        conversation_responses!inner(
          id,
          response_text,
          conversation_id
        ),
        profiles!response_moderation_log_performed_by_fkey(
          id,
          display_name
        )
      `
      )
      .eq("conversation_responses.conversation_id", conversationId)
      .order("performed_at", { ascending: false });

    if (logsError) {
      console.error("[GET moderation] Logs fetch error:", logsError);
      return jsonError("Failed to fetch moderation history", 500);
    }

    // 5. Transform logs to match ModerationLogEntry type
    const history: ModerationLogEntry[] = (logs ?? []).map((log) => {
      // Handle nested response data (Supabase returns as object or array)
      const responseData = Array.isArray(log.conversation_responses)
        ? log.conversation_responses[0]
        : log.conversation_responses;

      // Handle nested profile data
      const profileData = Array.isArray(log.profiles)
        ? log.profiles[0]
        : log.profiles;

      return {
        id: log.id,
        responseId: log.response_id,
        responseText: responseData?.response_text ?? "",
        action: log.action as ModerationAction,
        flag: log.flag as ModerationFlag,
        performedBy: {
          id: log.performed_by,
          name: profileData?.display_name ?? "Unknown",
        },
        performedAt: log.performed_at,
      };
    });

    // 6. Return response
    const response: ModerationHistoryResponse = { history };
    return NextResponse.json(response);
  } catch (error) {
    console.error("[GET moderation] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
