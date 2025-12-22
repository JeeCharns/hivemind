/**
 * Conversation Votes API Route
 *
 * GET - Get current user's votes for all proposals in a conversation
 * POST - Vote on a proposal (quadratic voting with budget enforcement)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { jsonError } from "@/lib/api/errors";
import { voteOnProposalSchema } from "@/lib/conversations/schemas";
import { voteOnProposal } from "@/lib/conversations/server/voteOnProposal";
import { getUserVotes } from "@/lib/conversations/server/getUserVotes";

/**
 * GET /api/conversations/[conversationId]/votes
 * Get current user's votes for all proposals
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    console.log("[GET /api/conversations/:id/votes] Starting");

    const { conversationId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      console.log("[GET /api/conversations/:id/votes] No session");
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Get conversation to verify it's a decision session
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id, type")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      console.log("[GET /api/conversations/:id/votes] Conversation not found");
      return jsonError("Conversation not found", 404);
    }

    if (conversation.type !== "decide") {
      console.log("[GET /api/conversations/:id/votes] Not a decision session");
      return jsonError("Voting is only available for decision sessions", 409, "NOT_DECISION_SESSION");
    }

    // 3. Verify membership
    try {
      await requireHiveMember(supabase, session.user.id, conversation.hive_id);
    } catch {
      console.log("[GET /api/conversations/:id/votes] Not a member");
      return jsonError("Unauthorized: Not a member of this hive", 403);
    }

    // 4. Fetch user votes
    const result = await getUserVotes(supabase, conversationId, session.user.id);

    console.log(`[GET /api/conversations/:id/votes] Returning ${Object.keys(result.votes).length} votes`);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/conversations/:id/votes] Error:", error);
    return jsonError("Internal server error", 500);
  }
}

/**
 * POST /api/conversations/[conversationId]/votes
 * Vote on a proposal (delta: 1 or -1)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    console.log("[POST /api/conversations/:id/votes] Starting");

    const { conversationId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      console.log("[POST /api/conversations/:id/votes] No session");
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Get conversation to verify it's a decision session
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id, type")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      console.log("[POST /api/conversations/:id/votes] Conversation not found");
      return jsonError("Conversation not found", 404);
    }

    if (conversation.type !== "decide") {
      console.log("[POST /api/conversations/:id/votes] Not a decision session");
      return jsonError("Voting is only available for decision sessions", 409, "NOT_DECISION_SESSION");
    }

    // 3. Verify membership
    try {
      await requireHiveMember(supabase, session.user.id, conversation.hive_id);
    } catch {
      console.log("[POST /api/conversations/:id/votes] Not a member");
      return jsonError("Unauthorized: Not a member of this hive", 403);
    }

    // 4. Validate input with Zod
    const body = await req.json();
    const validation = voteOnProposalSchema.safeParse(body);

    if (!validation.success) {
      console.log("[POST /api/conversations/:id/votes] Invalid input");
      return jsonError("Invalid request body", 400, "INVALID_INPUT");
    }

    const { responseId, delta } = validation.data;

    // 5. Execute vote via RPC (handles all validation and budget enforcement)
    const result = await voteOnProposal(supabase, {
      conversationId,
      responseId,
      userId: session.user.id,
      delta,
    });

    // 6. If vote failed, return error with code
    if (!result.success) {
      console.log(`[POST /api/conversations/:id/votes] Vote failed: ${result.errorCode}`);

      // Map error codes to HTTP status and messages
      const errorMap: Record<string, { status: number; message: string }> = {
        CONVERSATION_NOT_FOUND: { status: 404, message: "Conversation not found" },
        NOT_DECISION_SESSION: { status: 409, message: "Not a decision session" },
        RESPONSE_NOT_FOUND: { status: 404, message: "Response not found" },
        NOT_A_PROPOSAL: { status: 409, message: "Response is not a proposal" },
        NEGATIVE_VOTES: { status: 409, message: "Cannot reduce votes below zero" },
        BUDGET_EXCEEDED: { status: 409, message: "Insufficient credits" },
      };

      const errorInfo = errorMap[result.errorCode || ""] || {
        status: 500,
        message: "Vote failed",
      };

      return jsonError(errorInfo.message, errorInfo.status, result.errorCode);
    }

    console.log(`[POST /api/conversations/:id/votes] Vote successful: ${result.newVotes} votes, ${result.remainingCredits} credits left`);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/conversations/:id/votes] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
