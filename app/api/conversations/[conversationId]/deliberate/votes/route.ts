/**
 * Deliberate Votes API Route
 *
 * POST - Cast, update, or remove a vote on a statement
 * Requires authentication
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { voteOnStatement } from "@/lib/deliberate-space/server/voteOnStatement";
import { voteOnStatementSchema } from "@/lib/deliberate-space/schemas";
import { jsonError } from "@/lib/api/errors";

/**
 * POST /api/conversations/[conversationId]/deliberate/votes
 * Cast, update, or remove a vote on a statement
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
    const parsed = voteOnStatementSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues?.[0];
      return jsonError(
        firstError?.message ?? "Invalid request body",
        400,
        "VALIDATION_ERROR"
      );
    }

    // 3. Cast vote
    const supabase = await supabaseAdminClient();
    const result = await voteOnStatement(supabase, {
      ...parsed.data,
      userId: session.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST votes] Error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return jsonError(message, 500);
  }
}
