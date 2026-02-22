/**
 * POST /api/decision-space/[conversationId]/vote
 *
 * Cast a quadratic vote on a decision proposal
 * Requires authentication and hive membership
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { voteOnDecisionProposal } from "@/lib/decision-space/server/voteOnDecisionProposal";
import { voteOnProposalSchema } from "@/lib/decision-space/schemas";
import { jsonError } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    const body = await request.json();
    const parseResult = voteOnProposalSchema.safeParse(body);

    if (!parseResult.success) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    const supabase = await supabaseServerClient();
    const result = await voteOnDecisionProposal(
      supabase,
      userId,
      parseResult.data
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/decision-space/.../vote]", err);
    return jsonError("Failed to record vote", 500, "INTERNAL_ERROR");
  }
}
