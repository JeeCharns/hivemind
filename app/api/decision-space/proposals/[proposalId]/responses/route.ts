/**
 * GET /api/decision-space/proposals/[proposalId]/responses
 *
 * Fetch original responses that make up a consolidated proposal statement.
 * Used for lazy-loading in the vote tab.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { jsonError } from "@/lib/api/errors";

interface RouteParams {
  params: Promise<{ proposalId: string }>;
}

export interface OriginalResponse {
  id: number;
  text: string;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  console.log("[GET /api/decision-space/proposals/.../responses] Starting...");
  try {
    const session = await getServerSession();
    console.log(
      "[GET /api/decision-space/proposals/.../responses] Session:",
      session ? "found" : "null"
    );
    if (!session) {
      return jsonError("Unauthorized", 401, "UNAUTHORIZED");
    }
    const { proposalId } = await params;
    console.log(
      "[GET /api/decision-space/proposals/.../responses] proposalId:",
      proposalId
    );

    const supabase = supabaseAdminClient();

    // 1. Get the proposal and its source bucket
    const { data: proposal, error: proposalError } = await supabase
      .from("decision_proposals")
      .select("source_bucket_id")
      .eq("id", proposalId)
      .single();

    if (proposalError) {
      console.error(
        "[GET /api/decision-space/proposals/.../responses] Proposal error:",
        proposalError
      );
      return jsonError("Proposal not found", 404, "NOT_FOUND");
    }

    if (!proposal) {
      return jsonError("Proposal not found", 404, "NOT_FOUND");
    }

    if (!proposal.source_bucket_id) {
      // No source bucket - return empty array
      return NextResponse.json({ responses: [] });
    }

    // 2. First get the bucket members
    const { data: members, error: membersError } = await supabase
      .from("conversation_cluster_bucket_members")
      .select("response_id")
      .eq("bucket_id", proposal.source_bucket_id);

    if (membersError) {
      console.error(
        "[GET /api/decision-space/proposals/.../responses] Members error:",
        membersError
      );
      return jsonError(
        `Failed to fetch bucket members: ${membersError.message}`,
        500,
        "INTERNAL_ERROR"
      );
    }

    console.log(
      "[GET /api/decision-space/proposals/.../responses] Members found:",
      members?.length ?? 0
    );

    if (!members || members.length === 0) {
      return NextResponse.json({ responses: [] });
    }

    // 3. Fetch the responses by IDs
    const responseIds = members.map((m) => m.response_id);
    console.log(
      "[GET /api/decision-space/proposals/.../responses] Fetching response IDs:",
      responseIds
    );

    const { data: responseData, error: responsesError } = await supabase
      .from("conversation_responses")
      .select("id, response_text")
      .in("id", responseIds);

    if (responsesError) {
      console.error(
        "[GET /api/decision-space/proposals/.../responses] Responses error:",
        responsesError
      );
      return jsonError(
        `Failed to fetch responses: ${responsesError.message}`,
        500,
        "INTERNAL_ERROR"
      );
    }

    console.log(
      "[GET /api/decision-space/proposals/.../responses] Responses found:",
      responseData?.length ?? 0
    );

    // 4. Format responses
    const responses: OriginalResponse[] = (responseData || []).map((r) => ({
      id: r.id,
      text: r.response_text,
    }));

    return NextResponse.json({ responses });
  } catch (err) {
    console.error("[GET /api/decision-space/proposals/.../responses]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonError(message, 500, "INTERNAL_ERROR");
  }
}
