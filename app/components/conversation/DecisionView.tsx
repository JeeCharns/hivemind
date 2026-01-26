"use client";

/**
 * DecisionView - Decision Session Tabs Client Component
 *
 * Shows 3 tabs for decision sessions:
 * - Listen: Read-only view of proposals grouped by cluster
 * - Vote: Quadratic voting interface
 * - Results: Rankings with AI analysis (after round closes)
 */

import { useState } from "react";
import {
  Ear,
  CheckSquare,
  ChartBar,
  Wallet,
  Plus,
  Minus,
  Trophy,
  ArrowUp,
  ArrowDown,
  Clock,
  Users,
} from "@phosphor-icons/react";
import Button from "@/app/components/button";
import type { DecisionViewModel } from "@/lib/decision-space/server/getDecisionViewModel";

export interface DecisionViewProps {
  viewModel: DecisionViewModel;
  onVote: (proposalId: string, delta: 1 | -1) => Promise<void>;
}

type TabType = "listen" | "vote" | "results";

export default function DecisionView({ viewModel, onVote }: DecisionViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    // Default to vote tab if round is open, results if closed
    if (viewModel.currentRound?.status === "voting_open") {
      return "vote";
    }
    if (viewModel.results) {
      return "results";
    }
    return "listen";
  });

  const [loading, setLoading] = useState<string | null>(null);
  const [localVotes, setLocalVotes] = useState<Record<string, number>>(() => {
    const votes: Record<string, number> = {};
    viewModel.proposals.forEach((p) => {
      votes[p.id] = viewModel.userVotes[p.id] ?? 0;
    });
    return votes;
  });
  const [creditsSpent, setCreditsSpent] = useState(viewModel.totalCreditsSpent);
  const [creditsRemaining, setCreditsRemaining] = useState(viewModel.remainingCredits);

  const handleVote = async (proposalId: string, delta: 1 | -1) => {
    setLoading(proposalId);
    try {
      await onVote(proposalId, delta);

      // Update local state optimistically
      const currentVotes = localVotes[proposalId] || 0;
      const newVotes = currentVotes + delta;

      if (newVotes >= 0) {
        const oldCost = currentVotes * currentVotes;
        const newCost = newVotes * newVotes;
        const costDelta = newCost - oldCost;

        setLocalVotes((prev) => ({ ...prev, [proposalId]: newVotes }));
        setCreditsSpent((prev) => prev + costDelta);
        setCreditsRemaining((prev) => prev - costDelta);
      }
    } catch (error) {
      console.error("Vote failed:", error);
    } finally {
      setLoading(null);
    }
  };

  const getNextVoteCost = (currentVotes: number, delta: 1 | -1): number => {
    const newVotes = currentVotes + delta;
    if (newVotes < 0) return 0;
    const oldCost = currentVotes * currentVotes;
    const newCost = newVotes * newVotes;
    return newCost - oldCost;
  };

  const canAfford = (proposalId: string, delta: 1 | -1): boolean => {
    const currentVotes = localVotes[proposalId] || 0;
    if (delta === -1 && currentVotes === 0) return false;
    const cost = getNextVoteCost(currentVotes, delta);
    return creditsRemaining >= cost;
  };

  const isVotingOpen = viewModel.currentRound?.status === "voting_open";

  // Group proposals by cluster for the Listen tab
  const proposalsByCluster = viewModel.proposals.reduce((acc, proposal) => {
    const key = proposal.sourceClusterIndex;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(proposal);
    return acc;
  }, {} as Record<number, typeof viewModel.proposals>);

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "listen", label: "Listen", icon: <Ear size={18} weight="fill" /> },
    { id: "vote", label: "Vote", icon: <CheckSquare size={18} weight="fill" /> },
    { id: "results", label: "Results", icon: <ChartBar size={18} weight="fill" /> },
  ];

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto py-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 px-1 py-1 rounded-lg self-start">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const isDisabled = tab.id === "results" && !viewModel.results;
          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && setActiveTab(tab.id)}
              disabled={isDisabled}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-50 text-indigo-600"
                  : isDisabled
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-600 hover:bg-slate-50 hover:text-indigo-600"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Round Status Banner */}
      {viewModel.currentRound && (
        <div className={`rounded-lg border p-4 flex items-center justify-between ${
          isVotingOpen
            ? "bg-green-50 border-green-200"
            : "bg-amber-50 border-amber-200"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-2 ${isVotingOpen ? "bg-green-100" : "bg-amber-100"}`}>
              {isVotingOpen ? (
                <CheckSquare size={20} className="text-green-600" weight="fill" />
              ) : (
                <Clock size={20} className="text-amber-600" weight="fill" />
              )}
            </div>
            <div>
              <p className={`font-medium ${isVotingOpen ? "text-green-800" : "text-amber-800"}`}>
                Round {viewModel.currentRound.roundNumber}:{" "}
                {isVotingOpen ? "Voting Open" : "Voting Closed"}
              </p>
              {viewModel.currentRound.deadline && (
                <p className="text-sm text-slate-600">
                  Deadline: {new Date(viewModel.currentRound.deadline).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Listen Tab Content */}
      {activeTab === "listen" && (
        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Proposals</h2>
            <p className="text-slate-600 mb-6">
              These statements were selected from the problem space analysis. Review them before voting.
            </p>

            {Object.entries(proposalsByCluster).map(([clusterIndex, proposals]) => (
              <div key={clusterIndex} className="mb-6 last:mb-0">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">
                  Theme {Number(clusterIndex) + 1}
                </h3>
                <div className="space-y-3">
                  {proposals.map((proposal) => (
                    <div
                      key={proposal.id}
                      className="bg-slate-50 rounded-lg p-4 border border-slate-100"
                    >
                      <p className="text-slate-800">{proposal.statementText}</p>
                      {proposal.originalAgreePercent !== null && (
                        <p className="text-sm text-slate-500 mt-2">
                          Original agreement: {proposal.originalAgreePercent}%
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {viewModel.proposals.length === 0 && (
              <p className="text-slate-500 text-center py-8">No proposals yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Vote Tab Content */}
      {activeTab === "vote" && (
        <div className="flex flex-col gap-6">
          {/* Wallet Header */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-100 rounded-full p-3">
                <Wallet size={24} className="text-indigo-600" weight="fill" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Voting Credits
                </h3>
                <p className="text-sm text-slate-600">
                  Allocate your credits across proposals (cost = votes squared)
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-indigo-600">
                {creditsRemaining}
              </div>
              <div className="text-sm text-slate-600">
                of 99 credits remaining
              </div>
            </div>
          </div>

          {/* Voting Status Notice */}
          {!isVotingOpen && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
              <p className="text-amber-800 font-medium">
                Voting is currently closed. View results to see the outcome.
              </p>
            </div>
          )}

          {/* Proposals Grid */}
          <div className="grid gap-4">
            {viewModel.proposals.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-500">No proposals yet.</p>
              </div>
            ) : (
              viewModel.proposals.map((proposal) => {
                const currentVotes = localVotes[proposal.id] || 0;
                const currentCost = currentVotes * currentVotes;
                const nextUpCost = getNextVoteCost(currentVotes, 1);
                const nextDownCost = getNextVoteCost(currentVotes, -1);
                const isLoading = loading === proposal.id;

                return (
                  <div
                    key={proposal.id}
                    className="bg-white rounded-xl border border-slate-200 p-6 hover:border-slate-300 transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Proposal Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-base text-slate-900 mb-2">
                          {proposal.statementText}
                        </p>
                        {proposal.originalAgreePercent !== null && (
                          <p className="text-sm text-slate-500">
                            Original agreement: {proposal.originalAgreePercent}%
                          </p>
                        )}
                      </div>

                      {/* Voting Controls */}
                      <div className="flex flex-col items-center gap-3 min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleVote(proposal.id, -1)}
                            disabled={
                              !isVotingOpen ||
                              isLoading ||
                              !canAfford(proposal.id, -1) ||
                              currentVotes === 0
                            }
                            className="w-10 h-10"
                          >
                            <Minus size={16} weight="bold" />
                          </Button>

                          <div className="flex flex-col items-center min-w-[60px]">
                            <div className="text-2xl font-bold text-indigo-600">
                              {currentVotes}
                            </div>
                            <div className="text-xs text-slate-500">votes</div>
                          </div>

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleVote(proposal.id, 1)}
                            disabled={
                              !isVotingOpen ||
                              isLoading ||
                              !canAfford(proposal.id, 1)
                            }
                            className="w-10 h-10"
                          >
                            <Plus size={16} weight="bold" />
                          </Button>
                        </div>

                        <div className="text-center">
                          <div className="text-sm font-medium text-slate-700">
                            {currentCost} credits spent
                          </div>
                          {currentVotes > 0 && (
                            <div className="text-xs text-slate-500">
                              Next: {nextUpCost > 0 ? "+" : ""}
                              {nextUpCost} / {nextDownCost}
                            </div>
                          )}
                          {currentVotes === 0 && nextUpCost > 0 && (
                            <div className="text-xs text-slate-500">
                              First vote: {nextUpCost} credit{nextUpCost !== 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Summary Footer */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex items-center justify-between text-sm">
            <span className="text-slate-600">
              Total votes cast: {Object.values(localVotes).reduce((sum, v) => sum + v, 0)}
            </span>
            <span className="text-slate-600">
              Total credits spent: {creditsSpent} / 99
            </span>
          </div>
        </div>
      )}

      {/* Results Tab Content */}
      {activeTab === "results" && (
        <div className="flex flex-col gap-6">
          {viewModel.results ? (
            <>
              {/* Rankings */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy size={24} className="text-amber-500" weight="fill" />
                  <h2 className="text-xl font-semibold text-slate-900">
                    Round {viewModel.results.roundNumber} Results
                  </h2>
                </div>

                <div className="space-y-3">
                  {viewModel.results.proposalRankings.map((ranking, index) => (
                    <div
                      key={ranking.proposalId}
                      className={`rounded-lg p-4 border ${
                        index === 0
                          ? "bg-amber-50 border-amber-200"
                          : index === 1
                          ? "bg-slate-100 border-slate-200"
                          : index === 2
                          ? "bg-orange-50 border-orange-200"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                              index === 0
                                ? "bg-amber-200 text-amber-800"
                                : index === 1
                                ? "bg-slate-300 text-slate-700"
                                : index === 2
                                ? "bg-orange-200 text-orange-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {ranking.rank}
                          </div>
                          <div>
                            <p className="text-slate-900">{ranking.statementText}</p>
                            {ranking.changeFromPrevious !== undefined && (
                              <p
                                className={`text-sm mt-1 flex items-center gap-1 ${
                                  ranking.changeFromPrevious > 0
                                    ? "text-green-600"
                                    : ranking.changeFromPrevious < 0
                                    ? "text-red-600"
                                    : "text-slate-500"
                                }`}
                              >
                                {ranking.changeFromPrevious > 0 ? (
                                  <>
                                    <ArrowUp size={14} weight="bold" />
                                    Up {ranking.changeFromPrevious} from last round
                                  </>
                                ) : ranking.changeFromPrevious < 0 ? (
                                  <>
                                    <ArrowDown size={14} weight="bold" />
                                    Down {Math.abs(ranking.changeFromPrevious)} from last round
                                  </>
                                ) : (
                                  "No change"
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-indigo-600">
                            {ranking.totalVotes}
                          </div>
                          <div className="text-sm text-slate-500">
                            {ranking.votePercent}% of votes
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Analysis */}
              {viewModel.results.aiAnalysis && (
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Users size={24} className="text-indigo-600" weight="fill" />
                    <h2 className="text-xl font-semibold text-slate-900">
                      Analysis
                    </h2>
                  </div>
                  <div
                    className="prose prose-slate max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: viewModel.results.aiAnalysis.replace(/\n/g, "<br />"),
                    }}
                  />
                </div>
              )}

              {/* Generation Timestamp */}
              <p className="text-sm text-slate-500 text-center">
                Results generated at{" "}
                {new Date(viewModel.results.generatedAt).toLocaleString()}
              </p>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <ChartBar size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">
                Results will be available after the voting round closes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
