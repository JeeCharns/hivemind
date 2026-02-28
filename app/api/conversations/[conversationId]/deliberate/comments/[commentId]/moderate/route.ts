/**
 * Moderate Deliberation Comment API Route
 *
 * POST - Moderate a comment (admin only)
 * Sets moderation flag and creates audit log entry
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { jsonError } from "@/lib/api/errors";
import { requireHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
import { z } from "zod";
import { MODERATION_FLAGS } from "@/types/moderation";

const moderateSchema = z.object({
  flag: z.enum(MODERATION_FLAGS),
});

type RouteParams = { conversationId: string; commentId: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { conversationId, commentId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised: Not authenticated", 401);
    }

    const supabase = await supabaseAdminClient();

    // 2. Parse numeric ID (deliberation_comments.id is bigint)
    const numericId = parseInt(commentId, 10);
    if (isNaN(numericId)) {
      return jsonError("Invalid comment ID", 400);
    }

    // 3. Fetch comment and verify it exists and belongs to a statement in this conversation
    const { data: comment, error: fetchError } = await supabase
      .from("deliberation_comments")
      .select(`
        id,
        moderation_flag,
        statement_id,
        deliberation_statements!inner (
          conversation_id
        )
      `)
      .eq("id", numericId)
      .maybeSingle();

    if (fetchError) {
      console.error("[POST moderate comment] Fetch error:", fetchError);
      return jsonError("Failed to fetch comment", 500);
    }

    if (!comment) {
      return jsonError("Comment not found", 404);
    }

    // Verify the comment belongs to the correct conversation
    const statement = comment.deliberation_statements as unknown as {
      conversation_id: string;
    };
    if (statement.conversation_id !== conversationId) {
      return jsonError("Comment not found in this conversation", 404);
    }

    // 4. Check if already moderated
    if (comment.moderation_flag !== null) {
      return jsonError(
        "Comment is already moderated",
        400,
        "ALREADY_MODERATED"
      );
    }

    // 5. Get the conversation to find hive_id
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError) {
      console.error("[POST moderate comment] Conversation fetch error:", convError);
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

    // 8. Update comment with moderation fields
    const { error: updateError } = await supabase
      .from("deliberation_comments")
      .update({
        moderation_flag: flag,
        moderated_at: new Date().toISOString(),
        moderated_by: session.user.id,
      })
      .eq("id", numericId);

    if (updateError) {
      console.error("[POST moderate comment] Update error:", updateError);
      return jsonError("Failed to moderate comment", 500);
    }

    // 9. Create audit log entry
    const { error: logError } = await supabase
      .from("deliberation_comment_moderation_log")
      .insert({
        comment_id: numericId,
        action: "moderated",
        flag: flag,
        performed_by: session.user.id,
      });

    if (logError) {
      console.error("[POST moderate comment] Audit log error:", logError);
      // Note: Comment was updated successfully, but audit log failed
      // We still return success but log the error for monitoring
    }

    // 10. Return success
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST moderate comment] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
