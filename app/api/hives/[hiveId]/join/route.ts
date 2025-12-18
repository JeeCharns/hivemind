/**
 * Hive Join API Route
 *
 * POST - Join a hive by ID
 * Idempotently adds user as a member
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { joinHive } from "@/lib/hives/server/joinHive";
import { jsonError } from "@/lib/api/errors";

// Validation schema for hiveId param
const hiveIdSchema = z.string().uuid("Invalid hive ID format");

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  try {
    const { hiveId } = await params;

    // 1. Auth required
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    // 2. Validate hiveId
    const validation = hiveIdSchema.safeParse(hiveId);
    if (!validation.success) {
      return jsonError("Invalid hive ID", 400, "VALIDATION_ERROR");
    }

    // 3. Call service
    const supabase = await supabaseServerClient();
    try {
      const result = await joinHive(
        supabase,
        { id: session.user.id, email: session.user.email },
        hiveId
      );

      // 4. Return success
      return NextResponse.json(result);
    } catch (serviceError) {
      // Handle service-level errors
      const message =
        serviceError instanceof Error ? serviceError.message : "Unknown error";

      if (message.includes("not found")) {
        return jsonError("Hive not found", 404);
      }

      if (message.includes("Failed to initialize profile")) {
        return jsonError(
          "Failed to initialize user profile",
          500,
          "PROFILE_INIT_FAILED"
        );
      }

      throw serviceError; // Re-throw for generic error handler
    }
  } catch (error) {
    console.error("[POST /api/hives/[hiveId]/join] Error:", error);
    return jsonError("Internal server error", 500, "INTERNAL_ERROR");
  }
}
