/**
 * Deliberate Comments API Route
 *
 * POST - Add a comment to a statement
 * DELETE - Delete a comment (only owner can delete)
 * Requires authentication
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import {
  addComment,
  deleteComment,
} from "@/lib/deliberate-space/server/addComment";
import {
  addCommentSchema,
  deleteCommentSchema,
} from "@/lib/deliberate-space/schemas";
import { jsonError } from "@/lib/api/errors";

/**
 * POST /api/conversations/[conversationId]/deliberate/comments
 * Add a comment to a statement
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised", 401);
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const parsed = addCommentSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues?.[0];
      return jsonError(
        firstError?.message ?? "Invalid request body",
        400,
        "VALIDATION_ERROR"
      );
    }

    // 3. Add comment
    const supabase = await supabaseAdminClient();
    const result = await addComment(supabase, {
      ...parsed.data,
      userId: session.user.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[POST comments] Error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return jsonError(message, 500);
  }
}

/**
 * DELETE /api/conversations/[conversationId]/deliberate/comments?commentId=123
 * Delete a comment (only owner can delete)
 */
export async function DELETE(request: NextRequest) {
  try {
    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised", 401);
    }

    // 2. Parse and validate query params
    const { searchParams } = new URL(request.url);
    const parsed = deleteCommentSchema.safeParse({
      commentId: searchParams.get("commentId"),
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues?.[0];
      return jsonError(
        firstError?.message ?? "Invalid request body",
        400,
        "VALIDATION_ERROR"
      );
    }

    // 3. Delete comment
    const supabase = await supabaseAdminClient();
    await deleteComment(supabase, parsed.data.commentId, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE comments] Error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return jsonError(message, 500);
  }
}
