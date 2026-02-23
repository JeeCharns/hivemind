/**
 * Guest Responses API
 *
 * GET  /api/guest/[token]/responses — list responses for the conversation
 * POST /api/guest/[token]/responses — submit an anonymous guest response
 *
 * Auth: guest session cookie required.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { guestCreateResponseSchema } from "@/lib/conversations/guest/schemas";
import { requireGuestSession } from "@/lib/conversations/guest/requireGuestSession";
import { broadcastResponse } from "@/lib/conversations/server/broadcastResponse";
import {
  SYSTEM_USER_ID,
  GUEST_MAX_RESPONSES_PER_SESSION,
} from "@/lib/conversations/constants";

export const dynamic = "force-dynamic";

// ── GET — list responses ──────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const result = await requireGuestSession(token);
    if (!result.ok) return result.error;

    const { adminClient, conversationId, session } = result.ctx;

    // Rate limit by guest session ID
    const rateLimitResult = await checkRateLimit(
      session.guestSessionId,
      "general"
    );
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    // Fetch responses with guest_session info for "Guest N" display
    const { data: responses, error } = await adminClient
      .from("conversation_responses")
      .select(
        "id, response_text, tag, created_at, user_id, is_anonymous, guest_session_id, profiles:user_id(display_name, avatar_path), guest_sessions:guest_session_id(guest_number)"
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET guest/responses] Query error:", error);
      return jsonError("Failed to fetch responses", 500);
    }

    // Fetch like counts + guest's own likes
    const responseIds = responses?.map((r) => r.id) ?? [];
    const { data: likes } = responseIds.length
      ? await adminClient
          .from("response_likes")
          .select("response_id, user_id, guest_session_id")
          .in("response_id", responseIds)
      : {
          data: [] as {
            response_id: string;
            user_id: string;
            guest_session_id: string | null;
          }[],
        };

    const likeCounts = new Map<string, number>();
    const myLikes = new Set<string>();

    likes?.forEach((like) => {
      likeCounts.set(
        like.response_id,
        (likeCounts.get(like.response_id) ?? 0) + 1
      );
      if (like.guest_session_id === session.guestSessionId) {
        myLikes.add(like.response_id);
      }
    });

    // Normalise response format
    const normalized =
      responses?.map((r: Record<string, unknown>) => {
        const row = r as {
          id: string;
          response_text: string;
          tag: string | null;
          created_at: string;
          user_id: string;
          is_anonymous?: boolean | null;
          guest_session_id: string | null;
          profiles?: {
            display_name?: string | null;
            avatar_path?: string | null;
          } | null;
          guest_sessions?: { guest_number?: number | null } | null;
        };

        const isGuest = !!row.guest_session_id;
        const isAnonymous = row.is_anonymous ?? false;
        const guestNumber = row.guest_sessions?.guest_number;

        let displayName: string;
        if (isGuest && guestNumber != null) {
          displayName = `Guest ${guestNumber}`;
        } else if (isAnonymous) {
          displayName = "Anonymous";
        } else {
          displayName = row.profiles?.display_name || "Member";
        }

        return {
          id: row.id,
          text: row.response_text,
          tag: row.tag,
          createdAt: row.created_at,
          user: {
            name: displayName,
            avatarUrl: null, // Guests don't see profile avatars
          },
          likeCount: likeCounts.get(row.id) ?? 0,
          likedByMe: myLikes.has(row.id),
          isMine: row.guest_session_id === session.guestSessionId,
          isAnonymous: isAnonymous || isGuest,
        };
      }) ?? [];

    return NextResponse.json({ responses: normalized });
  } catch (err) {
    console.error("[GET guest/responses]", err);
    return jsonError("Internal server error", 500);
  }
}

// ── POST — submit guest response ──────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const result = await requireGuestSession(token);
    if (!result.ok) return result.error;

    const { adminClient, conversationId, session } = result.ctx;

    // Rate limit by guest session ID
    const rateLimitResult = await checkRateLimit(
      session.guestSessionId,
      "guest_response"
    );
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    // Check per-session response limit
    const { count } = await adminClient
      .from("conversation_responses")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("guest_session_id", session.guestSessionId);

    if ((count ?? 0) >= GUEST_MAX_RESPONSES_PER_SESSION) {
      return jsonError(
        "Maximum responses reached",
        429,
        "RESPONSE_LIMIT_EXCEEDED"
      );
    }

    // Check conversation phase — reject writes to closed/archived conversations
    const { data: convo } = await adminClient
      .from("conversations")
      .select("phase")
      .eq("id", conversationId)
      .single();

    if (convo?.phase === "closed" || convo?.phase === "archived") {
      return jsonError(
        "This conversation is no longer accepting responses",
        403,
        "CONVERSATION_CLOSED"
      );
    }

    // Validate input
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = guestCreateResponseSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    const { text, tag } = parsed.data;

    // Insert as anonymous guest response using system user ID
    const { data, error } = await adminClient
      .from("conversation_responses")
      .insert({
        conversation_id: conversationId,
        response_text: text.trim(),
        tag: tag || null,
        user_id: SYSTEM_USER_ID,
        is_anonymous: true,
        guest_session_id: session.guestSessionId,
      })
      .select("id, response_text, tag, created_at")
      .single();

    if (error || !data) {
      console.error("[POST guest/responses] Insert error:", error);
      return jsonError("Failed to create response", 500);
    }

    const response = {
      id: data.id,
      text: data.response_text,
      tag: data.tag,
      createdAt: data.created_at,
      user: {
        name: `Guest ${session.guestNumber}`,
        avatarUrl: null,
      },
      likeCount: 0,
      likedByMe: false,
      isMine: true,
      isAnonymous: true,
    };

    // Broadcast to realtime feed (fire-and-forget)
    broadcastResponse({ conversationId, response }).catch((err) => {
      console.error("[POST guest/responses] Broadcast error (non-fatal):", err);
    });

    return NextResponse.json({ response });
  } catch (err) {
    console.error("[POST guest/responses]", err);
    return jsonError("Internal server error", 500);
  }
}
