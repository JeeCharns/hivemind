/**
 * Deliberate View Model API Route
 *
 * GET - Get the complete deliberate view model with statements, votes, and clusters
 * Requires authentication
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getDeliberateViewModel } from "@/lib/deliberate-space/server/getDeliberateViewModel";
import { jsonError } from "@/lib/api/errors";

/**
 * GET /api/conversations/[conversationId]/deliberate
 * Get the deliberate view model with statements, votes, and clusters
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised", 401);
    }

    // 2. Get view model
    const supabase = await supabaseServerClient();
    const viewModel = await getDeliberateViewModel(supabase, {
      conversationId,
      userId: session.user.id,
    });

    if (!viewModel) {
      return jsonError("Conversation not found", 404);
    }

    return NextResponse.json(viewModel);
  } catch (error) {
    console.error("[GET deliberate] Error:", error);
    return jsonError("Internal error", 500);
  }
}
