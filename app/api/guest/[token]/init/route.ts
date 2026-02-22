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
  const { token } = await params;

  // Validate token format
  const tokenResult = shareTokenSchema.safeParse(token);
  if (!tokenResult.success) {
    return NextResponse.redirect(
      new URL("/login?error=share_link_expired", request.url)
    );
  }

  const adminClient = supabaseAdminClient();

  // Resolve token → conversation
  const resolved = await resolveShareToken(adminClient, token);

  // If the visitor already has a valid session for THIS conversation, skip creation
  const existing = await validateGuestSession(adminClient);
  if (existing && resolved && existing.conversationId === resolved.conversationId) {
    return NextResponse.redirect(
      new URL(`/respond/${token}/listen`, request.url)
    );
  }
  if (!resolved) {
    return NextResponse.redirect(
      new URL("/login?error=share_link_expired", request.url)
    );
  }

  // Create guest session (sets the httpOnly cookie — allowed in Route Handlers)
  await createGuestSession(
    adminClient,
    resolved.shareLink.id,
    resolved.shareLink.expiresAt
  );

  // Redirect back to the guest conversation page
  return NextResponse.redirect(
    new URL(`/respond/${token}/listen`, request.url)
  );
}
