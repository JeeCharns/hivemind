/**
 * Guest Route Guard
 *
 * Shared helper for guest API routes. Validates the guest session cookie,
 * verifies the share token matches the session's conversation, and returns
 * the validated session + admin client.
 *
 * Returns null + a NextResponse error if validation fails.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { jsonError } from "@/lib/api/errors";
import { shareTokenSchema } from "@/lib/conversations/guest/schemas";
import { resolveShareToken } from "@/lib/conversations/guest/conversationShareLinkService";
import {
  validateGuestSession,
  type ValidatedGuestSession,
} from "@/lib/conversations/guest/guestSessionService";
import { NextResponse } from "next/server";

export interface GuestRouteContext {
  session: ValidatedGuestSession;
  adminClient: SupabaseClient;
  conversationId: string;
}

/**
 * Validate a guest API request. Returns the context needed for the route
 * handler, or a tuple with a JSON error response.
 */
export async function requireGuestSession(
  token: string
): Promise<
  { ok: true; ctx: GuestRouteContext } | { ok: false; error: NextResponse }
> {
  // 1. Validate token format
  const tokenResult = shareTokenSchema.safeParse(token);
  if (!tokenResult.success) {
    return { ok: false, error: jsonError("Invalid share link", 400, "INVALID_TOKEN") };
  }

  const adminClient = supabaseAdminClient();

  // 2. Validate guest session cookie
  const guestSession = await validateGuestSession(adminClient);
  if (!guestSession) {
    return {
      ok: false,
      error: jsonError("Guest session expired or invalid", 401, "SESSION_INVALID"),
    };
  }

  // 3. Verify the token resolves and matches the session's conversation
  const resolved = await resolveShareToken(adminClient, token);
  if (!resolved) {
    return {
      ok: false,
      error: jsonError("Share link is invalid, expired, or revoked", 404, "LINK_NOT_FOUND"),
    };
  }

  if (resolved.conversationId !== guestSession.conversationId) {
    return {
      ok: false,
      error: jsonError("Session does not match this conversation", 403, "SCOPE_MISMATCH"),
    };
  }

  return {
    ok: true,
    ctx: {
      session: guestSession,
      adminClient,
      conversationId: guestSession.conversationId,
    },
  };
}
