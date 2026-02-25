/**
 * Guest Migration Check API
 *
 * GET /api/auth/guest-migration/check
 *
 * Checks if the authenticated user has an active guest session that can be migrated.
 * Returns session info including counts of contributions.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { getConvertibleGuestSession } from "@/lib/conversations/guest/guestSessionService";
import { jsonError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised", 401);
    }

    const adminClient = supabaseAdminClient();
    const guestSession = await getConvertibleGuestSession(adminClient);

    if (!guestSession) {
      return NextResponse.json({ hasGuestSession: false });
    }

    // Get contribution counts
    const [responsesResult, likesResult, feedbackResult] = await Promise.all([
      adminClient
        .from("conversation_responses")
        .select("id", { count: "exact", head: true })
        .eq("guest_session_id", guestSession.guestSessionId),
      adminClient
        .from("response_likes")
        .select("id", { count: "exact", head: true })
        .eq("guest_session_id", guestSession.guestSessionId),
      adminClient
        .from("response_feedback")
        .select("id", { count: "exact", head: true })
        .eq("guest_session_id", guestSession.guestSessionId),
    ]);

    return NextResponse.json({
      hasGuestSession: true,
      guestSessionId: guestSession.guestSessionId,
      guestNumber: guestSession.guestNumber,
      conversationTitle: guestSession.conversationTitle,
      hiveKey: guestSession.hiveKey,
      responsesCount: responsesResult.count ?? 0,
      likesCount: likesResult.count ?? 0,
      feedbackCount: feedbackResult.count ?? 0,
    });
  } catch (err) {
    console.error("[GET /api/auth/guest-migration/check]", err);
    return jsonError("Internal server error", 500);
  }
}
