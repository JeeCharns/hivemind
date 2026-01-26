// lib/decision-space/server/getDecisionViewModel.ts

/**
 * Get Decision View Model
 *
 * Server-side helper to build the complete view model for the Decision tabs
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DecisionProposalViewModel,
  DecisionRoundViewModel,
  DecisionResultViewModel,
  ProposalRanking,
} from "@/types/decision-space";

export interface DecisionViewModel {
  conversationId: string;
  proposals: DecisionProposalViewModel[];
  currentRound: DecisionRoundViewModel | null;
  userVotes: Record<string, number>; // proposalId -> votes
  totalCreditsSpent: number;
  remainingCredits: number;
  results: DecisionResultViewModel | null;
  isAdmin: boolean;
}

const TOTAL_CREDITS = 99;

/**
 * Build view model for Decision tabs
 *
 * @param supabase - Supabase client with auth
 * @param conversationId - Conversation ID (decision session)
 * @param userId - User ID
 * @param isAdmin - Whether user is an admin of the hive
 * @returns Complete decision view model
 */
export async function getDecisionViewModel(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  isAdmin: boolean
): Promise<DecisionViewModel> {
  // 1. Fetch all proposals for this decision session
  const { data: proposals, error: proposalsError } = await supabase
    .from("decision_proposals")
    .select("id, statement_text, source_cluster_index, original_agree_percent, display_order")
    .eq("conversation_id", conversationId)
    .order("display_order", { ascending: true });

  if (proposalsError) {
    console.error("[getDecisionViewModel] Failed to fetch proposals:", proposalsError);
    throw new Error("Failed to fetch proposals");
  }

  // 2. Fetch the current (most recent) round
  const { data: rounds, error: roundsError } = await supabase
    .from("decision_rounds")
    .select("id, round_number, status, visibility, deadline, opened_at, closed_at")
    .eq("conversation_id", conversationId)
    .order("round_number", { ascending: false })
    .limit(1);

  if (roundsError) {
    console.error("[getDecisionViewModel] Failed to fetch rounds:", roundsError);
    throw new Error("Failed to fetch rounds");
  }

  const currentRoundRow = rounds?.[0] ?? null;

  const currentRound: DecisionRoundViewModel | null = currentRoundRow
    ? {
        id: currentRoundRow.id,
        roundNumber: currentRoundRow.round_number,
        status: currentRoundRow.status,
        visibility: currentRoundRow.visibility,
        deadline: currentRoundRow.deadline,
        openedAt: currentRoundRow.opened_at,
        closedAt: currentRoundRow.closed_at,
      }
    : null;

  // 3. Fetch user's votes for the current round
  const userVotes: Record<string, number> = {};
  let totalCreditsSpent = 0;

  if (currentRoundRow) {
    const { data: votes, error: votesError } = await supabase
      .from("decision_votes")
      .select("proposal_id, votes")
      .eq("round_id", currentRoundRow.id)
      .eq("user_id", userId);

    if (votesError) {
      console.error("[getDecisionViewModel] Failed to fetch user votes:", votesError);
      throw new Error("Failed to fetch user votes");
    }

    for (const vote of votes || []) {
      userVotes[vote.proposal_id] = vote.votes;
      totalCreditsSpent += vote.votes * vote.votes; // Quadratic cost
    }
  }

  const remainingCredits = TOTAL_CREDITS - totalCreditsSpent;

  // 4. Fetch total votes per proposal if visibility allows
  const proposalTotals: Record<string, number> = {};

  if (currentRoundRow && (currentRoundRow.visibility === "transparent" || currentRoundRow.visibility === "aggregate")) {
    const { data: allVotes, error: allVotesError } = await supabase
      .from("decision_votes")
      .select("proposal_id, votes")
      .eq("round_id", currentRoundRow.id);

    if (!allVotesError && allVotes) {
      for (const vote of allVotes) {
        const current = proposalTotals[vote.proposal_id] || 0;
        proposalTotals[vote.proposal_id] = current + vote.votes;
      }
    }
  }

  // 5. Build proposal view models
  const proposalViewModels: DecisionProposalViewModel[] = (proposals || []).map((p) => ({
    id: p.id,
    statementText: p.statement_text,
    sourceClusterIndex: p.source_cluster_index,
    originalAgreePercent: p.original_agree_percent,
    displayOrder: p.display_order,
    totalVotes: currentRound?.visibility === "transparent" ? proposalTotals[p.id] : undefined,
    userVotes: userVotes[p.id] ?? 0,
  }));

  // 6. Fetch results for the current round (if closed)
  let results: DecisionResultViewModel | null = null;

  if (currentRoundRow && (currentRoundRow.status === "voting_closed" || currentRoundRow.status === "results_generated")) {
    const { data: resultData, error: resultError } = await supabase
      .from("decision_results")
      .select("round_id, proposal_rankings, ai_analysis, generated_at")
      .eq("round_id", currentRoundRow.id)
      .maybeSingle();

    if (!resultError && resultData) {
      results = {
        roundId: resultData.round_id,
        roundNumber: currentRound?.roundNumber ?? 1,
        proposalRankings: resultData.proposal_rankings as ProposalRanking[],
        aiAnalysis: resultData.ai_analysis,
        generatedAt: resultData.generated_at,
      };
    }
  }

  return {
    conversationId,
    proposals: proposalViewModels,
    currentRound,
    userVotes,
    totalCreditsSpent,
    remainingCredits,
    results,
    isAdmin,
  };
}
