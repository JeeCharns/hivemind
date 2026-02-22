/**
 * Profile Status API Route
 *
 * GET - Check if user has complete profile
 * Returns profile status for onboarding flow routing
 *
 * Also triggers auto-join to Welcome Hive (idempotent)
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getProfileStatus } from "@/lib/profile/server/getProfileStatus";
import { joinWelcomeHive } from "@/lib/hives/server/joinWelcomeHive";
import { jsonError } from "@/lib/api/errors";

export async function GET() {
  try {
    // 1. Auth required
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    // 2. Call services
    const supabase = await supabaseServerClient();

    // Auto-join Welcome Hive (idempotent, non-blocking)
    try {
      await joinWelcomeHive(supabase, session.user.id);
    } catch (err) {
      // Log but don't block profile status check
      console.error(
        "[GET /api/profile/status] Failed to join Welcome Hive:",
        err
      );
    }

    const status = await getProfileStatus(supabase, session.user.id);

    // 3. Return status
    return NextResponse.json(status);
  } catch (error) {
    console.error("[GET /api/profile/status] Error:", error);
    return jsonError("Internal server error", 500, "INTERNAL_ERROR");
  }
}
