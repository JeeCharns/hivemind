/**
 * Account API Route
 *
 * GET - Fetch account settings (email, profile data)
 * Returns view model for account settings page
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getAccountSettings } from "@/lib/account/server/getAccountSettings";
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
    const settings = await getAccountSettings(
      supabase,
      session.user.id,
      session.user.email ?? ""
    );

    // 3. Return settings
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[GET /api/account] Error:", error);
    return jsonError("Internal server error", 500, "INTERNAL_ERROR");
  }
}
