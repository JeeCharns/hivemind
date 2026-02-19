/**
 * PATCH/DELETE /api/hives/[hiveId]/reactions/[reactionId]
 *
 * Edit or delete a reaction (chat message).
 * Only the owner can edit/delete their own reactions.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";

const updateReactionSchema = z.object({
  message: z.string().max(50),
});

type RouteParams = { params: Promise<{ hiveId: string; reactionId: string }> };

/**
 * PATCH - Edit a reaction's message
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  // 1. Authenticate
  const session = await getServerSession();
  if (!session) {
    return jsonError("Unauthorised", 401);
  }

  const { hiveId, reactionId } = await params;
  const supabase = await supabaseServerClient();

  // 2. Verify ownership
  const { data: reaction, error: fetchError } = await supabase
    .from("hive_reactions")
    .select("id, user_id")
    .eq("id", reactionId)
    .eq("hive_id", hiveId)
    .maybeSingle();

  if (fetchError || !reaction) {
    return jsonError("Reaction not found", 404);
  }

  if (reaction.user_id !== session.user.id) {
    return jsonError("Forbidden: You can only edit your own messages", 403);
  }

  // 3. Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const validation = updateReactionSchema.safeParse(body);
  if (!validation.success) {
    return jsonError(
      validation.error.issues[0]?.message || "Invalid input",
      400
    );
  }

  // 4. Update reaction
  const { error: updateError } = await supabase
    .from("hive_reactions")
    .update({ message: validation.data.message })
    .eq("id", reactionId);

  if (updateError) {
    console.error("[PATCH reactions] Error:", updateError);
    return jsonError("Failed to update reaction", 500);
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE - Delete a reaction
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  // 1. Authenticate
  const session = await getServerSession();
  if (!session) {
    return jsonError("Unauthorised", 401);
  }

  const { hiveId, reactionId } = await params;
  const supabase = await supabaseServerClient();

  // 2. Verify ownership
  const { data: reaction, error: fetchError } = await supabase
    .from("hive_reactions")
    .select("id, user_id")
    .eq("id", reactionId)
    .eq("hive_id", hiveId)
    .maybeSingle();

  if (fetchError || !reaction) {
    return jsonError("Reaction not found", 404);
  }

  if (reaction.user_id !== session.user.id) {
    return jsonError("Forbidden: You can only delete your own messages", 403);
  }

  // 3. Delete reaction
  const { error: deleteError } = await supabase
    .from("hive_reactions")
    .delete()
    .eq("id", reactionId);

  if (deleteError) {
    console.error("[DELETE reactions] Error:", deleteError);
    return jsonError("Failed to delete reaction", 500);
  }

  return NextResponse.json({ success: true });
}
