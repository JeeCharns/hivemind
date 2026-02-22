"use client";

/**
 * VoteView - Quadratic Voting Tab Client Component
 *
 * Displays proposals with quadratic voting controls
 * Each user has 99 credits, cost = votes^2
 */

import { Plus, Minus, Wallet } from "@phosphor-icons/react";
import { useState } from "react";
import Button from "@/app/components/button";

export interface Proposal {
  id: string;
  text: string;
  author: {
    name: string;
    avatarUrl: string | null;
  };
  createdAt: string;
  currentVotes: number; // User's current vote count on this proposal
}

export interface VoteViewProps {
  proposals: Proposal[];
  totalCreditsSpent: number;
  remainingCredits: number;
  onVote: (proposalId: string, delta: 1 | -1) => Promise<void>;
}

export default function VoteView({
  proposals,
  totalCreditsSpent: initialSpent,
  remainingCredits: initialRemaining,
  onVote,
}: VoteViewProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [localVotes, setLocalVotes] = useState<Record<string, number>>(() => {
    const votes: Record<string, number> = {};
    proposals.forEach((p) => {
      votes[p.id] = p.currentVotes;
    });
    return votes;
  });
  const [creditsSpent, setCreditsSpent] = useState(initialSpent);
  const [creditsRemaining, setCreditsRemaining] = useState(initialRemaining);

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

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d
      .toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace(",", "");
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto px-4 py-6">
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
              Allocate your credits across proposals (cost = votes²)
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-indigo-600">
            {creditsRemaining}
          </div>
          <div className="text-sm text-slate-600">of 99 credits remaining</div>
        </div>
      </div>

      {/* Proposals Grid */}
      <div className="grid gap-4">
        {proposals.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">No proposals yet.</p>
          </div>
        ) : (
          proposals.map((proposal) => {
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
                    <p className="text-base text-slate-900 mb-3">
                      {proposal.text}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <span className="font-medium">
                        {proposal.author.name}
                      </span>
                      <span>•</span>
                      <span>{formatTimestamp(proposal.createdAt)}</span>
                    </div>
                  </div>

                  {/* Voting Controls */}
                  <div className="flex flex-col items-center gap-3 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleVote(proposal.id, -1)}
                        disabled={
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
                        disabled={isLoading || !canAfford(proposal.id, 1)}
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
                          First vote: {nextUpCost} credit
                          {nextUpCost !== 1 ? "s" : ""}
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
          Total votes cast:{" "}
          {Object.values(localVotes).reduce((sum, v) => sum + v, 0)}
        </span>
        <span className="text-slate-600">
          Total credits spent: {creditsSpent} / 99
        </span>
      </div>
    </div>
  );
}
