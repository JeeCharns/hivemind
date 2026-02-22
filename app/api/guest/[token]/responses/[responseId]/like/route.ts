/**
 * Guest Response Like API
 *
 * POST   /api/guest/[token]/responses/[responseId]/like — add like
 * DELETE /api/guest/[token]/responses/[responseId]/like — remove like
 *
 * Auth: guest session cookie required.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { requireGuestSession } from "@/lib/conversations/guest/requireGuestSession";
import { broadcastLikeUpdate } from "@/lib/conversations/server/broadcastLikeUpdate";

export const dynamic = "force-dynamic";

/** System user for guest operations. */
const SYSTEM_USER_ID = "c8661a31-3493-4c0f-9f14-0c08fcc68696";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; responseId: string }> }
) {
  try {
    const { token, responseId } = await params;
    const result = await requireGuestSession(token);
    if (!result.ok) return result.error;

    const { adminClient, conversationId, session } = result.ctx;

    // Verify response belongs to this conversation
    const { data: response, error: respErr } = await adminClient
      .from("conversation_responses")
      .select("id")
      .eq("id", responseId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (respErr || !response) {
      return jsonError("Response not found", 404);
    }

    // Upsert guest like (using guest_session_id for uniqueness)
    const { error: insertError } = await adminClient
      .from("response_likes")
      .insert({
        response_id: responseId,
        user_id: SYSTEM_USER_ID,
        guest_session_id: session.guestSessionId,
      });

    if (insertError) {
      // Duplicate like — ignore gracefully
      if (insertError.code === "23505") {
        // Already liked — return current count
      } else {
        console.error("[POST guest/like] Insert error:", insertError);
        return jsonError("Failed to add like", 500);
      }
    }

    // Fetch updated count
    const { count, error: countErr } = await adminClient
      .from("response_likes")
      .select("*", { count: "exact", head: true })
      .eq("response_id", responseId);

    if (countErr) {
      return jsonError("Failed to fetch like count", 500);
    }

    const likeCount = count ?? 0;

    // Broadcast (fire-and-forget)
    broadcastLikeUpdate({
      conversationId,
      payload: { responseId, likeCount, userId: SYSTEM_USER_ID },
    }).catch(() => {});

    return NextResponse.json({ liked: true, like_count: likeCount });
  } catch (err) {
    console.error("[POST guest/like]", err);
    return jsonError("Internal server error", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; responseId: string }> }
) {
  try {
    const { token, responseId } = await params;
    const result = await requireGuestSession(token);
    if (!result.ok) return result.error;

    const { adminClient, conversationId, session } = result.ctx;

    // Verify response belongs to this conversation
    const { data: response, error: respErr } = await adminClient
      .from("conversation_responses")
      .select("id")
      .eq("id", responseId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (respErr || !response) {
      return jsonError("Response not found", 404);
    }

    // Delete guest like
    const { error: deleteError } = await adminClient
      .from("response_likes")
      .delete()
      .eq("response_id", responseId)
      .eq("guest_session_id", session.guestSessionId);

    if (deleteError) {
      console.error("[DELETE guest/like] Delete error:", deleteError);
      return jsonError("Failed to remove like", 500);
    }

    // Fetch updated count
    const { count, error: countErr } = await adminClient
      .from("response_likes")
      .select("*", { count: "exact", head: true })
      .eq("response_id", responseId);

    if (countErr) {
      return jsonError("Failed to fetch like count", 500);
    }

    const likeCount = count ?? 0;

    // Broadcast (fire-and-forget)
    broadcastLikeUpdate({
      conversationId,
      payload: { responseId, likeCount, userId: SYSTEM_USER_ID },
    }).catch(() => {});

    return NextResponse.json({ liked: false, like_count: likeCount });
  } catch (err) {
    console.error("[DELETE guest/like]", err);
    return jsonError("Internal server error", 500);
  }
}
