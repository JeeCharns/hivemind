/**
 * Comment Services
 *
 * Handles adding and deleting comments on deliberation statements.
 * Supports both authenticated users and guests via share links.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AddCommentInput } from "@/lib/deliberate-space/schemas";

interface AddCommentParams extends AddCommentInput {
  userId?: string;
  guestSessionId?: string;
}

export interface AddCommentResult {
  id: number;
  createdAt: string;
}

/**
 * Add a comment to a statement
 *
 * @param supabase - Supabase client with auth
 * @param params - Statement ID, comment text, anonymity flag, and user/guest identifiers
 * @returns Created comment ID and timestamp
 * @throws Error if user/guest not provided or statement not found
 */
export async function addComment(
  supabase: SupabaseClient,
  params: AddCommentParams
): Promise<AddCommentResult> {
  const { statementId, text, isAnonymous, userId, guestSessionId } = params;

  if (!userId && !guestSessionId) {
    throw new Error("Must provide userId or guestSessionId");
  }

  // Verify statement exists
  const { data: statement } = await supabase
    .from("deliberation_statements")
    .select("id")
    .eq("id", statementId)
    .maybeSingle();

  if (!statement) {
    throw new Error("Statement not found");
  }

  const commentData: Record<string, unknown> = {
    statement_id: statementId,
    comment_text: text,
    is_anonymous: isAnonymous ?? false,
  };

  if (userId) {
    commentData.user_id = userId;
  } else {
    commentData.guest_session_id = guestSessionId;
  }

  const { data: comment, error } = await supabase
    .from("deliberation_comments")
    .insert(commentData)
    .select("id, created_at")
    .single();

  if (error || !comment) {
    console.error("[addComment] Failed:", error);
    throw new Error("Failed to add comment");
  }

  return { id: comment.id, createdAt: comment.created_at };
}

/**
 * Delete a comment (only owner can delete)
 *
 * @param supabase - Supabase client with auth
 * @param commentId - ID of the comment to delete
 * @param userId - User ID (if authenticated user)
 * @param guestSessionId - Guest session ID (if guest via share link)
 * @returns true if deleted successfully
 * @throws Error if user/guest not provided or comment not found/not owned
 */
export async function deleteComment(
  supabase: SupabaseClient,
  commentId: number,
  userId?: string,
  guestSessionId?: string
): Promise<boolean> {
  if (!userId && !guestSessionId) {
    throw new Error("Must provide userId or guestSessionId");
  }

  // Verify ownership
  let query = supabase
    .from("deliberation_comments")
    .select("id")
    .eq("id", commentId);

  if (userId) {
    query = query.eq("user_id", userId);
  } else {
    query = query.eq("guest_session_id", guestSessionId!);
  }

  const { data: comment } = await query.maybeSingle();

  if (!comment) {
    throw new Error("Comment not found or not owned by user");
  }

  const { error } = await supabase
    .from("deliberation_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    throw new Error("Failed to delete comment");
  }

  return true;
}
