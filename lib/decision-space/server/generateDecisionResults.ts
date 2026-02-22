// lib/decision-space/server/generateDecisionResults.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { createOpenAIClient } from "@/lib/analysis/openai/embeddingsClient";
import { generateDecisionAnalysis } from "@/lib/analysis/openai/generateDecisionAnalysis";
import type { ProposalRanking } from "@/types/decision-space";

/**
 * Generate results for a closed decision round
 */
export async function generateDecisionResults(
  supabase: SupabaseClient,
  roundId: string
): Promise<void> {
  // 1. Fetch round info
  const { data: round, error: roundError } = await supabase
    .from("decision_rounds")
    .select("id, conversation_id, round_number")
    .eq("id", roundId)
    .single();

  if (roundError || !round) {
    throw new Error("Round not found");
  }

  // 2. Fetch all proposals for this conversation
  const { data: proposals, error: proposalsError } = await supabase
    .from("decision_proposals")
    .select("id, statement_text, original_agree_percent, display_order")
    .eq("conversation_id", round.conversation_id)
    .order("display_order", { ascending: true });

  if (proposalsError || !proposals) {
    throw new Error("Failed to fetch proposals");
  }

  // 3. Fetch vote totals per proposal
  const { data: votes, error: votesError } = await supabase
    .from("decision_votes")
    .select("proposal_id, votes, user_id")
    .eq("round_id", roundId);

  if (votesError) {
    throw new Error("Failed to fetch votes");
  }

  // 4. Calculate totals
  const voteTotals = new Map<string, number>();
  const uniqueVoters = new Set<string>();
  let totalVotesAllProposals = 0;

  for (const vote of votes || []) {
    const current = voteTotals.get(vote.proposal_id) || 0;
    voteTotals.set(vote.proposal_id, current + vote.votes);
    totalVotesAllProposals += vote.votes;
    uniqueVoters.add(vote.user_id);
  }

  // 5. Build rankings
  const rankings: ProposalRanking[] = proposals
    .map((p) => ({
      proposalId: p.id,
      statementText: p.statement_text,
      totalVotes: voteTotals.get(p.id) || 0,
      votePercent:
        totalVotesAllProposals > 0
          ? Math.round(
              ((voteTotals.get(p.id) || 0) / totalVotesAllProposals) * 100
            )
          : 0,
      rank: 0,
    }))
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .map((r, index) => ({ ...r, rank: index + 1 }));

  // 6. Fetch previous round results for comparison (if exists)
  let previousRankings: ProposalRanking[] | null = null;
  if (round.round_number > 1) {
    const { data: prevRound } = await supabase
      .from("decision_rounds")
      .select("id")
      .eq("conversation_id", round.conversation_id)
      .eq("round_number", round.round_number - 1)
      .single();

    if (prevRound) {
      const { data: prevResults } = await supabase
        .from("decision_results")
        .select("proposal_rankings")
        .eq("round_id", prevRound.id)
        .single();

      if (prevResults) {
        previousRankings = prevResults.proposal_rankings as ProposalRanking[];
      }
    }
  }

  // 7. Add change from previous
  if (previousRankings) {
    const prevRankMap = new Map(
      previousRankings.map((r) => [r.proposalId, r.rank])
    );
    for (const ranking of rankings) {
      const prevRank = prevRankMap.get(ranking.proposalId);
      if (prevRank !== undefined) {
        ranking.changeFromPrevious = prevRank - ranking.rank;
      }
    }
  }

  // 8. Fetch conversation title for AI analysis
  const { data: conversation } = await supabase
    .from("conversations")
    .select("source_conversation_id, title")
    .eq("id", round.conversation_id)
    .single();

  // 9. Get source consensus data from proposals
  const sourceConsensusData = proposals.map((p) => ({
    statementText: p.statement_text,
    agreePercent: p.original_agree_percent || 0,
  }));

  // 10. Generate AI analysis
  const openai = createOpenAIClient();
  const aiAnalysis = await generateDecisionAnalysis(openai, {
    sessionTitle: conversation?.title || "Decision Session",
    rankings,
    previousRankings,
    sourceConsensusData,
    roundNumber: round.round_number,
    totalVoters: uniqueVoters.size,
  });

  // 11. Save results
  const { error: insertError } = await supabase
    .from("decision_results")
    .insert({
      round_id: roundId,
      proposal_rankings: rankings,
      ai_analysis: aiAnalysis,
    });

  if (insertError) {
    console.error(
      "[generateDecisionResults] Failed to save results:",
      insertError
    );
    throw new Error("Failed to save results");
  }
}
