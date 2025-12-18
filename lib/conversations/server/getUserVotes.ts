/**
 * Get User Votes Service
 *
 * Server-side logic for fetching a user's votes in a conversation
 * Uses existing quadratic_vote_allocations and quadratic_vote_budgets tables
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface GetUserVotesResult {
  votes: Record<string, number>; // responseId -> vote count
  totalCreditsSpent: number;
  remainingCredits: number;
}

const MAX_BUDGET = 99;

/**
 * Get a user's votes for all proposals in a conversation
 *
 * @param supabase - Supabase client with auth
 * @param conversationId - Conversation ID
 * @param userId - User ID
 * @returns User's votes and credit summary
 */
export async function getUserVotes(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<GetUserVotesResult> {
  // Fetch all votes for this user in this conversation from existing table
  const { data: voteRows, error } = await supabase
    .from("quadratic_vote_allocations")
    .select("proposal_response_id, votes")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);

  if (error) {
    console.error("[getUserVotes] Query error:", error);
    throw new Error("Failed to fetch user votes");
  }

  // Fetch budget info from existing budgets table
  const { data: budget } = await supabase
    .from("quadratic_vote_budgets")
    .select("credits_total, credits_spent")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  const votes: Record<string, number> = {};
  let totalCreditsSpent = 0;

  for (const row of voteRows || []) {
    // Convert BIGINT response ID to string for consistency
    votes[String(row.proposal_response_id)] = row.votes;
    // Quadratic cost: votes^2
    totalCreditsSpent += row.votes * row.votes;
  }

  // Use budget table if available, otherwise calculate from votes
  const creditsSpent = budget?.credits_spent ?? totalCreditsSpent;
  const creditsTotal = budget?.credits_total ?? MAX_BUDGET;
  const remainingCredits = creditsTotal - creditsSpent;

  return {
    votes,
    totalCreditsSpent: creditsSpent,
    remainingCredits,
  };
}
