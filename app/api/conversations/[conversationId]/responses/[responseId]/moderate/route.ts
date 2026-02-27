/**
 * Moderate Response API Route
 *
 * POST - Moderate a response (admin only)
 * Sets moderation flag and creates audit log entry
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import { requireHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
import { z } from "zod";
import { MODERATION_FLAGS } from "@/types/moderation";

const moderateSchema = z.object({
  flag: z.enum(MODERATION_FLAGS),
});

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
      console.error("[POST moderate] Fetch error:", fetchError);
      return jsonError("Failed to fetch response", 500);
    }

    if (!response) {
      return jsonError("Response not found", 404);
    }

    // 4. Check if already moderated
    if (response.moderation_flag !== null) {
      return jsonError("Response is already moderated", 400, "ALREADY_MODERATED");
    }

    // 5. Get the conversation to find hive_id
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError) {
      console.error("[POST moderate] Conversation fetch error:", convError);
      return jsonError("Failed to fetch conversation", 500);
    }

    if (!conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 6. Verify admin access
    try {
      await requireHiveAdmin(supabase, session.user.id, conversation.hive_id);
    } catch {
      return jsonError("Unauthorised: Admin access required", 403);
    }

    // 7. Validate request body
    const body = await req.json();
    const validation = moderateSchema.safeParse(body);

    if (!validation.success) {
      return jsonError("Invalid request body", 400, "INVALID_INPUT");
    }

    const { flag } = validation.data;

    // 8. Update response with moderation fields
    const { error: updateError } = await supabase
      .from("conversation_responses")
      .update({
        moderation_flag: flag,
        moderated_at: new Date().toISOString(),
        moderated_by: session.user.id,
      })
      .eq("id", numericId);

    if (updateError) {
      console.error("[POST moderate] Update error:", updateError);
      return jsonError("Failed to moderate response", 500);
    }

    // 9. Create audit log entry
    const { error: logError } = await supabase
      .from("response_moderation_log")
      .insert({
        response_id: numericId,
        action: "moderated",
        flag: flag,
        performed_by: session.user.id,
      });

    if (logError) {
      console.error("[POST moderate] Audit log error:", logError);
      // Note: Response was updated successfully, but audit log failed
      // We still return success but log the error for monitoring
    }

    // 10. Return success
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST moderate] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
