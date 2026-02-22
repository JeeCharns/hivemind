/**
 * GET /api/decision-space/setup
 *
 * Fetch clusters and statements from a source understand session
 * for use in decision space setup wizard
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { getDecisionSetupData } from "@/lib/decision-space/server/getDecisionSetupData";
import { getDecisionSetupDataSchema } from "@/lib/decision-space/schemas";
import { jsonError } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const sourceConversationId = searchParams.get("sourceConversationId");

    const parseResult = getDecisionSetupDataSchema.safeParse({
      sourceConversationId,
    });
    if (!parseResult.success) {
      return jsonError(
        "sourceConversationId is required",
        400,
        "VALIDATION_ERROR"
      );
    }

    const supabase = await supabaseServerClient();
    const data = await getDecisionSetupData(
      supabase,
      userId,
      parseResult.data.sourceConversationId
    );

    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/decision-space/setup]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonError(message, 500, "INTERNAL_ERROR");
  }
}
