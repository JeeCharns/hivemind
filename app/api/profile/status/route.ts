/**
 * Profile Status API Route
 *
 * GET - Check if user has complete profile
 * Returns profile status for onboarding flow routing
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getProfileStatus } from "@/lib/profile/server/getProfileStatus";
import { jsonError } from "@/lib/api/errors";

export async function GET() {
  try {
    // 1. Auth required
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    // 2. Call service
    const supabase = await supabaseServerClient();
    const status = await getProfileStatus(supabase, session.user.id);

    // 3. Return status
    return NextResponse.json(status);
  } catch (error) {
    console.error("[GET /api/profile/status] Error:", error);
    return jsonError("Internal server error", 500, "INTERNAL_ERROR");
  }
}
