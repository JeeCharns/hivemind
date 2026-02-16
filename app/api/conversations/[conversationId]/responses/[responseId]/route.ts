/**
 * Individual Response API Route
 *
 * PATCH - Edit a response (owner only)
 * DELETE - Delete a response (owner only)
 * Requires authentication and response ownership
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import { z } from "zod";

const editResponseSchema = z.object({
  text: z.string().min(1).max(300),
});

type RouteParams = { conversationId: string; responseId: string };

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { conversationId, responseId } = await params;
    console.log("[PATCH response] START - conversationId:", conversationId, "responseId:", responseId);

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      console.log("[PATCH response] No session");
      return jsonError("Unauthorised: Not authenticated", 401);
    }
    console.log("[PATCH response] User authenticated:", session.user.id);

    const supabase = await supabaseServerClient();

    // Parse numeric ID (conversation_responses.id is bigint)
    const numericId = parseInt(responseId, 10);
    if (isNaN(numericId)) {
      console.log("[PATCH response] Invalid numeric ID:", responseId);
      return jsonError("Invalid response ID", 400);
    }
    console.log("[PATCH response] Parsed numericId:", numericId);

    // 2. Verify response exists and belongs to user
    console.log("[PATCH response] Fetching response...");
    const { data: response, error: fetchError } = await supabase
      .from("conversation_responses")
      .select("id, user_id, conversation_id")
      .eq("id", numericId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (fetchError) {
      console.error("[PATCH response] Fetch error:", fetchError);
      return jsonError("Response not found", 404);
    }

    if (!response) {
      console.log("[PATCH response] Response not found for id:", numericId);
      return jsonError("Response not found", 404);
    }
    console.log("[PATCH response] Found response, user_id:", response.user_id);

    if (response.user_id !== session.user.id) {
      console.log("[PATCH response] User mismatch - response.user_id:", response.user_id, "session.user.id:", session.user.id);
      return jsonError("Unauthorised: You can only edit your own responses", 403);
    }

    // 3. Validate input
    const body = await req.json();
    console.log("[PATCH response] Request body:", body);
    const validation = editResponseSchema.safeParse(body);

    if (!validation.success) {
      console.error("[PATCH response] Validation error:", validation.error);
      return jsonError("Invalid request body", 400, "INVALID_INPUT");
    }
    console.log("[PATCH response] Validation passed, text length:", validation.data.text.length);

    // 4. Update response
    console.log("[PATCH response] Updating response...");
    const { data: updated, error: updateError } = await supabase
      .from("conversation_responses")
      .update({
        response_text: validation.data.text.trim(),
      })
      .eq("id", numericId)
      .select("id, response_text, tag, created_at, user_id, is_anonymous, profiles:user_id(display_name, avatar_path)")
      .maybeSingle();

    if (updateError) {
      console.error("[PATCH response] Update error:", updateError);
      return jsonError("Failed to update response", 500);
    }

    if (!updated) {
      console.error("[PATCH response] No rows updated for id:", numericId);
      return jsonError("Failed to update response", 500);
    }
    console.log("[PATCH response] Update successful, updated data:", updated);

    // 5. Format response
    const profile = updated.profiles as
      | { display_name?: string | null; avatar_path?: string | null }
      | null
      | undefined;
    const isAnonymous = updated.is_anonymous ?? false;

    return NextResponse.json({
      success: true,
      response: {
        id: updated.id,
        text: updated.response_text,
        tag: updated.tag,
        createdAt: updated.created_at,
        user: {
          name: isAnonymous ? "Anonymous" : (profile?.display_name || "Member"),
          avatarUrl: isAnonymous ? null : (profile?.avatar_path || null),
        },
        isMine: true,
      },
    });
  } catch (error) {
    console.error("[PATCH response] Error:", error);
    return jsonError("Internal server error", 500);
  }
}

export async function DELETE(
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

    // Parse numeric ID (conversation_responses.id is bigint)
    const numericId = parseInt(responseId, 10);
    if (isNaN(numericId)) {
      return jsonError("Invalid response ID", 400);
    }

    // 2. Verify response exists and belongs to user
    const { data: response, error: fetchError } = await supabase
      .from("conversation_responses")
      .select("id, user_id, conversation_id")
      .eq("id", numericId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (fetchError || !response) {
      return jsonError("Response not found", 404);
    }

    if (response.user_id !== session.user.id) {
      return jsonError("Unauthorised: You can only delete your own responses", 403);
    }

    // 3. Delete response (cascades to likes via FK)
    const { error: deleteError } = await supabase
      .from("conversation_responses")
      .delete()
      .eq("id", numericId);

    if (deleteError) {
      console.error("[DELETE response] Delete error:", deleteError);
      return jsonError("Failed to delete response", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE response] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
