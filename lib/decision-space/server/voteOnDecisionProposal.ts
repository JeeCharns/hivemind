// lib/decision-space/server/voteOnDecisionProposal.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoteOnProposalInput, VoteOnProposalResult } from "@/types/decision-space";

/**
 * Vote on a decision proposal using quadratic voting
 * Calls the vote_on_decision_proposal RPC function
 */
export async function voteOnDecisionProposal(
  supabase: SupabaseClient,
  userId: string,
  input: VoteOnProposalInput
): Promise<VoteOnProposalResult> {
  const { roundId, proposalId, delta } = input;

  const { data, error } = await supabase.rpc("vote_on_decision_proposal", {
    p_round_id: roundId,
    p_proposal_id: proposalId,
    p_user_id: userId,
    p_delta: delta,
  });

  if (error) {
    console.error("[voteOnDecisionProposal] RPC error:", error);
    throw new Error("Failed to record vote");
  }

  if (!data) {
    throw new Error("No response from vote RPC");
  }

  return {
    success: data.success,
    newVotes: data.new_votes,
    remainingCredits: data.remaining_credits,
    errorCode: data.error_code,
  };
}
