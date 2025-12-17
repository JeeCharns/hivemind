/**
 * Vote On Proposal Service
 *
 * Server-side logic for quadratic voting on proposals
 * Uses PostgreSQL RPC function for atomic budget enforcement
 * Works with existing quadratic_vote_allocations table (proposal_response_id BIGINT)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface VoteOnProposalParams {
  conversationId: string;
  responseId: string;
  userId: string;
  delta: 1 | -1;
}

export interface VoteOnProposalResult {
  success: boolean;
  newVotes: number;
  remainingCredits: number;
  errorCode?: string;
}

/**
 * Vote on a proposal using quadratic voting
 *
 * @param supabase - Supabase client with auth
 * @param params - Vote parameters
 * @returns Vote result with success status and remaining credits
 */
export async function voteOnProposal(
  supabase: SupabaseClient,
  params: VoteOnProposalParams
): Promise<VoteOnProposalResult> {
  const { conversationId, responseId, userId, delta } = params;

  // Parse response ID as integer (existing table uses BIGINT)
  const responseIdInt = parseInt(responseId, 10);
  if (isNaN(responseIdInt)) {
    throw new Error(`Invalid response ID: ${responseId}`);
  }

  // Call PostgreSQL RPC function for atomic voting with budget enforcement
  const { data, error } = await supabase.rpc("vote_on_proposal", {
    p_conversation_id: conversationId,
    p_response_id: responseIdInt,
    p_user_id: userId,
    p_delta: delta,
  });

  if (error) {
    console.error("[voteOnProposal] RPC error:", error);
    throw new Error("Failed to execute vote");
  }

  // RPC returns a single row with success, new_votes, remaining_credits, error_code
  if (!data || data.length === 0) {
    throw new Error("No result from vote RPC");
  }

  const result = data[0];

  return {
    success: result.success,
    newVotes: result.new_votes,
    remainingCredits: result.remaining_credits,
    errorCode: result.error_code || undefined,
  };
}
