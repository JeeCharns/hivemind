/**
 * Guest Session API
 *
 * GET /api/guest/[token]/session
 *
 * Public endpoint. Resolves a share token, creates or resumes a guest
 * session, sets an httpOnly cookie, and returns conversation metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { jsonError } from "@/lib/api/errors";
import { shareTokenSchema } from "@/lib/conversations/guest/schemas";
import { resolveShareToken } from "@/lib/conversations/guest/conversationShareLinkService";
import {
  createGuestSession,
  validateGuestSession,
} from "@/lib/conversations/guest/guestSessionService";
import type { GuestSessionInfo } from "@/types/guest-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // 1. Validate token format
    const tokenResult = shareTokenSchema.safeParse(token);
    if (!tokenResult.success) {
      return jsonError("Invalid share link", 400, "INVALID_TOKEN");
    }

    const adminClient = supabaseAdminClient();

    // 2. Resolve token → conversation (always validate the URL token first)
    const resolved = await resolveShareToken(adminClient, token);

    // 3. Check for existing valid session (returning visitor)
    // Important: check shareLinkId, not just conversationId, because each share link
    // should have its own set of guest numbers (Guest 1, 2, 3... per link)
    const existingSession = await validateGuestSession(adminClient);
    if (
      existingSession &&
      resolved &&
      existingSession.conversationId === resolved.conversationId &&
      existingSession.shareLinkId === resolved.shareLink.id
    ) {
      const info: GuestSessionInfo = {
        guestSessionId: existingSession.guestSessionId,
        guestNumber: existingSession.guestNumber,
        conversationId: existingSession.conversationId,
        conversationTitle: existingSession.conversationTitle,
        conversationDescription: existingSession.conversationDescription,
        conversationType: existingSession.conversationType as
          | "understand"
          | "decide",
        expiresAt: resolved.shareLink.expiresAt,
        tabs: ["listen", "understand", "result"],
      };

      return NextResponse.json({ session: info });
    }

    // 4. No valid session for this token's conversation
    if (!resolved) {
      return jsonError(
        "Share link is invalid, expired, or revoked",
        404,
        "LINK_NOT_FOUND"
      );
    }

    // 5. Create a new guest session
    const guestSession = await createGuestSession(
      adminClient,
      resolved.shareLink.id,
      resolved.shareLink.expiresAt
    );

    const info: GuestSessionInfo = {
      guestSessionId: guestSession.id,
      guestNumber: guestSession.guestNumber,
      conversationId: resolved.conversationId,
      conversationTitle: resolved.conversationTitle,
      conversationDescription: resolved.conversationDescription,
      conversationType: resolved.conversationType as "understand" | "decide",
      expiresAt: guestSession.expiresAt,
      tabs: ["listen", "understand", "result"],
    };

    return NextResponse.json({ session: info });
  } catch (err) {
    console.error("[GET /api/guest/[token]/session]", err);
    return jsonError("Internal server error", 500);
  }
}
