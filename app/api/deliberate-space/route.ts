/**
 * Deliberate Space API Route
 *
 * POST - Create a new deliberate session with statements
 * Requires authentication and hive membership
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { createDeliberateSession } from "@/lib/deliberate-space/server/createDeliberateSession";
import { createDeliberateSessionSchema } from "@/lib/deliberate-space/schemas";
import { jsonError } from "@/lib/api/errors";

/**
 * POST /api/deliberate-space
 * Create a new deliberate session with statements
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised", 401);
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const parsed = createDeliberateSessionSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues?.[0];
      return jsonError(
        firstError?.message ?? "Invalid request body",
        400,
        "VALIDATION_ERROR"
      );
    }

    // 3. Create deliberate session (use admin client to bypass RLS for inserts)
    const supabase = supabaseAdminClient();
    const result = await createDeliberateSession(
      supabase,
      session.user.id,
      parsed.data
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[POST /api/deliberate-space] Error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return jsonError(message, 500);
  }
}
