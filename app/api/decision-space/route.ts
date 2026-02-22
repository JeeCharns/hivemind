/**
 * POST /api/decision-space
 *
 * Create a new decision session from an understand session
 * Requires authentication and hive admin role
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { createDecisionSession } from "@/lib/decision-space/server/createDecisionSession";
import { createDecisionSessionSchema } from "@/lib/decision-space/schemas";
import { jsonError } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    const body = await request.json();
    const parseResult = createDecisionSessionSchema.safeParse(body);

    if (!parseResult.success) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    // Use admin client to bypass RLS for insert operations
    const supabase = supabaseAdminClient();
    const result = await createDecisionSession(
      supabase,
      userId,
      parseResult.data
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[POST /api/decision-space]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("admin") ? 403 : 500;
    return jsonError(
      message,
      status,
      status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR"
    );
  }
}
