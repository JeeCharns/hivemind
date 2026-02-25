/**
 * Guest Migration Execute API
 *
 * POST /api/auth/guest-migration/execute
 *
 * Executes the migration of guest session data to the authenticated user's account.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import {
  getConvertibleGuestSession,
  clearGuestSessionCookie,
} from "@/lib/conversations/guest/guestSessionService";
import { migrateGuestSession } from "@/lib/auth/server/migrateGuestSession";
import { jsonError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const executeSchema = z.object({
  keepAnonymous: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised", 401);
    }

    // Validate request body
    const rawBody = await request.json().catch(() => null);
    const parsed = executeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    const { keepAnonymous } = parsed.data;
    const adminClient = supabaseAdminClient();

    // Get convertible session
    const guestSession = await getConvertibleGuestSession(adminClient);
    if (!guestSession) {
      return jsonError("No guest session to migrate", 404, "NO_SESSION");
    }

    // Execute migration
    const result = await migrateGuestSession(adminClient, {
      userId: session.user.id,
      guestSessionId: guestSession.guestSessionId,
      keepAnonymous,
    });

    // Clear the guest session cookie
    await clearGuestSessionCookie();

    return NextResponse.json({
      migrated: true,
      responsesCount: result.responsesCount,
      likesCount: result.likesCount,
      feedbackCount: result.feedbackCount,
      joinedHiveIds: result.hiveIds,
      redirectTo: `/hives/${guestSession.hiveKey}`,
    });
  } catch (err) {
    console.error("[POST /api/auth/guest-migration/execute]", err);
    return jsonError("Failed to migrate guest session", 500);
  }
}
