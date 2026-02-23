/**
 * Guest Session Initialisation (Redirect)
 *
 * GET /api/guest/[token]/init
 *
 * Public endpoint. First-time guests are redirected here from the layout.
 * Resolves the share token, creates a guest session (sets httpOnly cookie),
 * then redirects back to /respond/[token]/listen.
 *
 * This exists because cookies can only be set in a Route Handler or Server
 * Action — not in a Server Component (the guest layout).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { shareTokenSchema } from "@/lib/conversations/guest/schemas";
import { resolveShareToken } from "@/lib/conversations/guest/conversationShareLinkService";
import {
  createGuestSession,
  validateGuestSession,
} from "@/lib/conversations/guest/guestSessionService";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // 1. Validate token format
    const tokenResult = shareTokenSchema.safeParse(token);
    if (!tokenResult.success) {
      console.warn("[GET guest/init] Invalid token format");
      return NextResponse.redirect(
        new URL("/login?error=share_link_expired", request.url)
      );
    }

    const adminClient = supabaseAdminClient();

    // 2. Resolve token → conversation (fail early if invalid/expired)
    const resolved = await resolveShareToken(adminClient, token);
    if (!resolved) {
      console.warn("[GET guest/init] Token resolution failed");
      return NextResponse.redirect(
        new URL("/login?error=share_link_expired", request.url)
      );
    }

    // 3. Check if visitor already has a valid session for THIS conversation
    const existing = await validateGuestSession(adminClient);
    if (existing && existing.conversationId === resolved.conversationId) {
      // Session exists for this conversation — skip creation, redirect directly
      return NextResponse.redirect(
        new URL(`/respond/${token}/listen`, request.url)
      );
    }

    // 4. Create new guest session (sets httpOnly cookie — allowed in Route Handlers)
    await createGuestSession(
      adminClient,
      resolved.shareLink.id,
      resolved.shareLink.expiresAt
    );

    // 5. Redirect to the guest conversation page
    return NextResponse.redirect(
      new URL(`/respond/${token}/listen`, request.url)
    );
  } catch (err) {
    console.error("[GET guest/init] Unexpected error:", err);
    return NextResponse.redirect(
      new URL("/login?error=share_link_expired", request.url)
    );
  }
}
