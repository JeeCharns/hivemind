/**
 * Guest Understand API
 *
 * GET /api/guest/[token]/understand — returns the full UnderstandViewModel
 *
 * Auth: guest session cookie required.
 * Delegates to the shared getUnderstandViewModel helper with { isGuest: true }.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { requireGuestSession } from "@/lib/conversations/guest/requireGuestSession";
import { getUnderstandViewModel } from "@/lib/conversations/server/getUnderstandViewModel";
import { SYSTEM_USER_ID } from "@/lib/conversations/constants";

export const dynamic = "force-dynamic";

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

    // Delegate to shared helper — skips membership check, identifies guest feedback
    const viewModel = await getUnderstandViewModel(
      adminClient,
      conversationId,
      SYSTEM_USER_ID,
      { isGuest: true, guestSessionId: session.guestSessionId }
    );

    return NextResponse.json(viewModel);
  } catch (err) {
    console.error("[GET guest/understand]", err);
    return jsonError("Internal server error", 500);
  }
}
