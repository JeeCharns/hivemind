/**
 * Reinstate Response API Route
 *
 * POST - Reinstate a moderated response (admin only)
 * Clears moderation flag and creates audit log entry
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import { requireHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";

type RouteParams = { conversationId: string; responseId: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { conversationId, responseId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Parse numeric ID (conversation_responses.id is bigint)
    const numericId = parseInt(responseId, 10);
    if (isNaN(numericId)) {
      return jsonError("Invalid response ID", 400);
    }

    // 3. Fetch response and verify it exists and belongs to the conversation
    const { data: response, error: fetchError } = await supabase
      .from("conversation_responses")
      .select("id, conversation_id, moderation_flag")
      .eq("id", numericId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (fetchError) {
      console.error("[POST reinstate] Fetch error:", fetchError);
      return jsonError("Failed to fetch response", 500);
    }

    if (!response) {
      return jsonError("Response not found", 404);
    }

    // 4. Check if response is moderated (must be moderated to reinstate)
    if (response.moderation_flag === null) {
      return jsonError("Response is not moderated", 400, "NOT_MODERATED");
    }

    // 5. Save original flag for audit log
    const originalFlag = response.moderation_flag;

    // 6. Get the conversation to find hive_id
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError) {
      console.error("[POST reinstate] Conversation fetch error:", convError);
      return jsonError("Failed to fetch conversation", 500);
    }

    if (!conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 7. Verify admin access
    try {
      await requireHiveAdmin(supabase, session.user.id, conversation.hive_id);
    } catch {
      return jsonError("Unauthorised: Admin access required", 403);
    }

    // 8. Clear moderation fields
    const { error: updateError } = await supabase
      .from("conversation_responses")
      .update({
        moderation_flag: null,
        moderated_at: null,
        moderated_by: null,
      })
      .eq("id", numericId);

    if (updateError) {
      console.error("[POST reinstate] Update error:", updateError);
      return jsonError("Failed to reinstate response", 500);
    }

    // 9. Create audit log entry with original flag
    const { error: logError } = await supabase
      .from("response_moderation_log")
      .insert({
        response_id: numericId,
        action: "reinstated",
        flag: originalFlag,
        performed_by: session.user.id,
      });

    if (logError) {
      console.error("[POST reinstate] Audit log error:", logError);
      // Note: Response was updated successfully, but audit log failed
      // We still return success but log the error for monitoring
    }

    // 10. Return success
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST reinstate] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
