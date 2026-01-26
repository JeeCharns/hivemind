"use client";

/**
 * DecisionView - Decision Session Tabs Client Component
 *
 * Shows 2 tabs for decision sessions:
 * - Vote: Quadratic voting interface
 * - Results: Rankings with AI analysis (after round closes)
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChartBar,
  Wallet,
  Plus,
  Minus,
  Trophy,
  ArrowUp,
  ArrowDown,
  Users,
  ShieldCheck,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react";
import Button from "@/app/components/button";
import type { DecisionViewModel } from "@/lib/decision-space/server/getDecisionViewModel";

interface OriginalResponse {
  id: number;
  text: string;
}

export interface DecisionViewProps {
  viewModel: DecisionViewModel;
  activeTab?: "vote" | "results";
  onVote: (proposalId: string, delta: 1 | -1) => Promise<void>;
  onCloseRound?: () => Promise<void>;
  isClosingRound?: boolean;
  error?: string | null;
  onVoteError?: (errorMessage: string) => void;
  onClearError?: () => void;
}

export default function DecisionView({
  viewModel,
  activeTab = "vote",
  onVote,
  onCloseRound,
  isClosingRound = false,
  error,
  onVoteError,
  onClearError,
}: DecisionViewProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});
  const [proposalResponses, setProposalResponses] = useState<Record<string, OriginalResponse[]>>({});
  const [loadingResponses, setLoadingResponses] = useState<Record<string, boolean>>({});
  const [localVotes, setLocalVotes] = useState<Record<string, number>>(() => {
    const votes: Record<string, number> = {};
    viewModel.proposals.forEach((p) => {
      votes[p.id] = viewModel.userVotes[p.id] ?? 0;
    });
    return votes;
  });
  const [creditsSpent, setCreditsSpent] = useState(viewModel.totalCreditsSpent);
  const [creditsRemaining, setCreditsRemaining] = useState(viewModel.remainingCredits);

  // Calculate and update time remaining for deadline
  useEffect(() => {
    if (!viewModel.currentRound?.deadline) {
      setTimeRemaining(null);
      return;
    }

    const calculateTimeRemaining = () => {
      const deadline = new Date(viewModel.currentRound!.deadline!);
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining("Deadline passed");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h remaining`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m remaining`);
      } else {
        setTimeRemaining(`${minutes}m remaining`);
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [viewModel.currentRound]);

  const handleCloseRoundClick = async () => {
    setShowCloseConfirm(false);
    if (onCloseRound) {
      await onCloseRound();
    }
  };

  const toggleResponses = async (proposalId: string) => {
    // If already expanded, just collapse
    if (expandedResponses[proposalId]) {
      setExpandedResponses((prev) => ({ ...prev, [proposalId]: false }));
      return;
    }

    // If already loaded, just expand
    if (proposalResponses[proposalId]) {
      setExpandedResponses((prev) => ({ ...prev, [proposalId]: true }));
      return;
    }

    // Fetch responses
    setLoadingResponses((prev) => ({ ...prev, [proposalId]: true }));
    try {
      const url = `/api/decision-space/proposals/${proposalId}/responses`;
      console.log("[DecisionView] Fetching responses from:", url);
      const response = await fetch(url);
      console.log("[DecisionView] Response status:", response.status, response.statusText);
      const text = await response.text();
      console.log("[DecisionView] Response body:", text.substring(0, 500));
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("[DecisionView] Failed to parse JSON:", text.substring(0, 200));
        throw new Error("Invalid response from server");
      }
      if (!response.ok) {
        console.error("[DecisionView] API error:", data);
        throw new Error(data.error || "Failed to fetch responses");
      }
      setProposalResponses((prev) => ({ ...prev, [proposalId]: data.responses }));
      setExpandedResponses((prev) => ({ ...prev, [proposalId]: true }));
    } catch (err) {
      console.error("[DecisionView] Failed to fetch responses:", err);
    } finally {
      setLoadingResponses((prev) => ({ ...prev, [proposalId]: false }));
    }
  };

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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Vote failed";
      console.error("[DecisionView] Vote failed:", err);
      onVoteError?.(message);
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
  const isTransparent = viewModel.currentRound?.visibility === "transparent";

  // Sort proposals by total votes (descending) when transparent
  const sortedProposals = isTransparent
    ? [...viewModel.proposals].sort((a, b) => (b.totalVotes ?? 0) - (a.totalVotes ?? 0))
    : viewModel.proposals;

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Admin Panel - only shown to admins when voting is open */}
      {viewModel.isAdmin && viewModel.currentRound && isVotingOpen && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full p-2 bg-slate-200">
              <ShieldCheck size={20} className="text-slate-600" weight="fill" />
            </div>
            <div>
              <p className="font-medium text-slate-800">Admin panel</p>
              {timeRemaining && (
                <p className="text-sm text-slate-600">{timeRemaining}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            {viewModel.voterCount > 0 && (
              <div className="text-right">
                <p className="text-sm font-medium text-slate-700">
                  {viewModel.averageCreditUsagePercent}% avg credit usage
                </p>
                <p className="text-xs text-slate-500">
                  {viewModel.voterCount} voter{viewModel.voterCount !== 1 ? "s" : ""}
                </p>
              </div>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCloseConfirm(true)}
              disabled={isClosingRound}
            >
              {isClosingRound ? "Closing..." : "Close voting round"}
            </Button>
          </div>
        </div>
      )}

      {/* Close Round Confirmation Modal */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Close voting round?
            </h3>
            <p className="text-slate-600 mb-4">
              Are you sure you want to close the voting round? This will end voting and generate the results. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowCloseConfirm(false)}
                disabled={isClosingRound}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCloseRoundClick}
                disabled={isClosingRound}
              >
                {isClosingRound ? "Closing..." : "Close round"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center justify-between">
          <p className="text-red-800 text-sm">{error}</p>
          {onClearError && (
            <button
              onClick={onClearError}
              className="text-red-600 hover:text-red-800 text-sm font-medium"
              aria-label="Dismiss error message"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Source Conversation Link */}
      {viewModel.sourceConversation && (
        <p className="text-sm text-slate-600">
          These proposals were generated from &quot;
          <Link
            href={`/hives/${viewModel.sourceConversation.hiveSlug || viewModel.sourceConversation.hiveId}/conversations/${viewModel.sourceConversation.slug || viewModel.sourceConversation.id}/listen`}
            style={{ color: "#2563eb", textDecoration: "underline" }}
          >
            {viewModel.sourceConversation.title}
          </Link>
          &quot;
        </p>
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
            {sortedProposals.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-500">No proposals yet.</p>
              </div>
            ) : (
              sortedProposals.map((proposal) => {
                const currentVotes = localVotes[proposal.id] || 0;
                const currentCost = currentVotes * currentVotes;
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
                          <p className="text-sm text-slate-500 mb-2">
                            Original agreement: {proposal.originalAgreePercent}%
                          </p>
                        )}
                        {/* Show Original Responses - only if source bucket exists */}
                        {proposal.sourceBucketId && (
                          <div className="mt-2">
                            <button
                              onClick={() => toggleResponses(proposal.id)}
                              className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                              disabled={loadingResponses[proposal.id]}
                            >
                              {loadingResponses[proposal.id] ? (
                                "Loading..."
                              ) : expandedResponses[proposal.id] ? (
                                <>
                                  <CaretUp size={14} weight="bold" />
                                  Hide original responses
                                </>
                              ) : (
                                <>
                                  <CaretDown size={14} weight="bold" />
                                  Show original responses
                                </>
                              )}
                            </button>
                            {expandedResponses[proposal.id] && proposalResponses[proposal.id] && (
                              <div className="mt-3 pl-4 border-l-2 border-slate-200 space-y-2">
                                {proposalResponses[proposal.id].length === 0 ? (
                                  <p className="text-sm text-slate-400 italic">No original responses found</p>
                                ) : (
                                  proposalResponses[proposal.id].map((response) => (
                                    <p key={response.id} className="text-sm text-slate-600">
                                      &ldquo;{response.text}&rdquo;
                                    </p>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
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
                            aria-label={`Remove vote from proposal: ${proposal.statementText.slice(0, 50)}`}
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
                            aria-label={`Add vote to proposal: ${proposal.statementText.slice(0, 50)}`}
                          >
                            <Plus size={16} weight="bold" />
                          </Button>
                        </div>

                        <div className="text-center">
                          <div className="text-sm font-medium text-slate-700">
                            {currentCost} credits spent
                          </div>
                        </div>
                      </div>

                      {/* Total Votes - shown when transparent */}
                      {isTransparent && (
                        <div className="flex flex-col items-center justify-center min-w-[80px] pl-4 border-l border-slate-200">
                          <div className="text-2xl font-bold text-slate-700">
                            {proposal.totalVotes ?? 0}
                          </div>
                          <div className="text-xs text-slate-500">total votes</div>
                        </div>
                      )}
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
                  <div className="prose prose-slate max-w-none whitespace-pre-wrap">
                    {viewModel.results.aiAnalysis}
                  </div>
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
