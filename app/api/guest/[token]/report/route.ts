/**
 * Guest Report API
 *
 * GET /api/guest/[token]/report — returns the full ResultViewModel
 *
 * Auth: guest session cookie required.
 * Read-only — guests cannot trigger report generation.
 * Delegates to the shared getReportViewModel helper with { isGuest: true }.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { requireGuestSession } from "@/lib/conversations/guest/requireGuestSession";
import { getReportViewModel } from "@/lib/conversations/server/getReportViewModel";
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

    // Delegate to shared helper — skips membership check, forces canGenerate=false
    const viewModel = await getReportViewModel(
      adminClient,
      conversationId,
      SYSTEM_USER_ID,
      { isGuest: true }
    );

    return NextResponse.json(viewModel);
  } catch (err) {
    console.error("[GET guest/report]", err);
    return jsonError("Internal server error", 500);
  }
}
