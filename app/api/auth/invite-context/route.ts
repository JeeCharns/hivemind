import { NextRequest, NextResponse } from "next/server";
import { getInviteCookie, clearInviteCookie, setInviteCookie } from "@/lib/auth/server/inviteCookie";
import { inviteTokenSchema } from "@/lib/hives/schemas";

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

/**
 * POST /api/auth/invite-context
 * Stores an invite token in a cookie so it survives the OAuth/magic-link redirect.
 * Called by the login page when an invite token is present in URL params.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = inviteTokenSchema.safeParse({ token: body?.token });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    await setInviteCookie(parsed.data.token);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
