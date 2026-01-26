/**
 * POST /api/decision-space/[conversationId]/rounds/[roundId]/close
 *
 * Close a voting round and trigger results generation
 * Requires authentication and hive admin role
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { closeDecisionRound } from "@/lib/decision-space/server/closeDecisionRound";
import { jsonError } from "@/lib/api/errors";

interface RouteParams {
  params: Promise<{ conversationId: string; roundId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;
    const { roundId } = await params;

    const supabase = await supabaseServerClient();
    const result = await closeDecisionRound(supabase, userId, roundId);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/decision-space/.../close]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("admin") ? 403 : 500;
    return jsonError(message, status, status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR");
  }
}
