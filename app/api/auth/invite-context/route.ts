import { NextResponse } from "next/server";
import { getInviteCookie, clearInviteCookie } from "@/lib/auth/server/inviteCookie";

/**
 * GET /api/auth/invite-context
 * Returns the stored invite token from the cookie and clears it.
 * Called by the auth callback page to restore invite context after magic link auth.
 */
export async function GET() {
  const token = await getInviteCookie();

  if (token) {
    await clearInviteCookie();
  }

  return NextResponse.json({ token });
}
