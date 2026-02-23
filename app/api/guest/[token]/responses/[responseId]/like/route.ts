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
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { requireGuestSession } from "@/lib/conversations/guest/requireGuestSession";
import { broadcastLikeUpdate } from "@/lib/conversations/server/broadcastLikeUpdate";
import { SYSTEM_USER_ID } from "@/lib/conversations/constants";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Validates responseId path parameter (numeric string or UUID). */
const responseIdSchema = z
  .union([z.string().regex(/^\d+$/), z.string().uuid()])
  .transform(String);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; responseId: string }> }
) {
  try {
    const { token, responseId: rawResponseId } = await params;

    // Validate responseId format
    const idResult = responseIdSchema.safeParse(rawResponseId);
    if (!idResult.success) {
      return jsonError("Invalid response ID", 400, "INVALID_RESPONSE_ID");
    }
    const responseId = idResult.data;

    const result = await requireGuestSession(token);
    if (!result.ok) return result.error;

    const { adminClient, conversationId, session } = result.ctx;

    // Rate limit by guest session ID
    const rateLimitResult = await checkRateLimit(
      session.guestSessionId,
      "guest_like"
    );
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

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
    const { token, responseId: rawResponseId } = await params;

    // Validate responseId format
    const idResult = responseIdSchema.safeParse(rawResponseId);
    if (!idResult.success) {
      return jsonError("Invalid response ID", 400, "INVALID_RESPONSE_ID");
    }
    const responseId = idResult.data;

    const result = await requireGuestSession(token);
    if (!result.ok) return result.error;

    const { adminClient, conversationId, session } = result.ctx;

    // Rate limit by guest session ID
    const rateLimitResult = await checkRateLimit(
      session.guestSessionId,
      "guest_like"
    );
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

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
