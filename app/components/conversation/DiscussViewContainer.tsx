"use client";

/**
 * DiscussViewContainer - Client Component
 *
 * Container component for the Discuss tab that manages state and API interactions
 * Handles voting with optimistic updates
 */

import { useState, useCallback, useMemo } from "react";
import type { DeliberateViewModel, VoteValue } from "@/types/deliberate-space";
import DiscussView from "./DiscussView";

interface DiscussViewContainerProps {
  initialViewModel: DeliberateViewModel;
  /** Whether the current user is an admin (can moderate comments) */
  isAdmin?: boolean;
}

export default function DiscussViewContainer({
  initialViewModel,
  isAdmin = false,
}: DiscussViewContainerProps) {
  const [viewModel, setViewModel] = useState(initialViewModel);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(
    null
  );
  // Track statements user has interacted with (voted or passed)
  // Initialize from server data
  const [passedStatements, setPassedStatements] = useState<Set<string>>(() => {
    return new Set(initialViewModel.userPasses || []);
  });

  // Combined set of statements user has interacted with
  const interactedStatements = useMemo(() => {
    const interacted = new Set<string>();
    // Add all voted statements (vote value 1-5)
    for (const [id, vote] of Object.entries(viewModel.userVotes)) {
      if (vote !== null && vote !== undefined) {
        interacted.add(id);
      }
    }
    // Add all passed statements
    for (const id of passedStatements) {
      interacted.add(id);
    }
    return interacted;
  }, [viewModel.userVotes, passedStatements]);

  const handleVote = useCallback(
    async (statementId: string, voteValue: VoteValue | null) => {
      // Capture previous state
      let previousVote: VoteValue | null = null;
      let previousVoteCount = 0;
      const wasPassed = passedStatements.has(statementId);
      const hadActualVote = viewModel.userVotes[statementId] !== undefined &&
                            viewModel.userVotes[statementId] !== null &&
                            !wasPassed;

      // Optimistic update
      setViewModel((prev) => {
        previousVote = prev.userVotes[statementId] ?? null;

        // Calculate vote count delta
        const isNewActualVote = voteValue !== null;
        let voteCountDelta = 0;

        if (isNewActualVote && !hadActualVote) {
          // Adding a new vote (wasn't voted or was passed before)
          voteCountDelta = 1;
        } else if (!isNewActualVote && hadActualVote) {
          // Removing a vote (had a vote, now passing)
          voteCountDelta = -1;
        }
        // Changing vote value (1-5 to 1-5) or pass to pass = no delta

        // Update statements with new vote count
        const updatedStatements = prev.statements.map((stmt) => {
          if (stmt.id === statementId) {
            previousVoteCount = stmt.voteCount;
            return {
              ...stmt,
              voteCount: Math.max(0, stmt.voteCount + voteCountDelta),
            };
          }
          return stmt;
        });

        return {
          ...prev,
          statements: updatedStatements,
          userVotes: { ...prev.userVotes, [statementId]: voteValue },
        };
      });

      // Track pass state separately
      if (voteValue === null) {
        setPassedStatements((prev) => new Set([...prev, statementId]));
      } else {
        // If voting, remove from passed set
        setPassedStatements((prev) => {
          const next = new Set(prev);
          next.delete(statementId);
          return next;
        });
      }

      try {
        const response = await fetch(
          `/api/conversations/${viewModel.conversationId}/deliberate/votes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ statementId, voteValue }),
          }
        );

        if (!response.ok) {
          throw new Error("Vote failed");
        }
      } catch (error) {
        // Revert on error
        setViewModel((prev) => ({
          ...prev,
          statements: prev.statements.map((stmt) =>
            stmt.id === statementId
              ? { ...stmt, voteCount: previousVoteCount }
              : stmt
          ),
          userVotes: { ...prev.userVotes, [statementId]: previousVote },
        }));
        // Revert pass state
        if (voteValue === null) {
          setPassedStatements((prev) => {
            const next = new Set(prev);
            if (!wasPassed) next.delete(statementId);
            return next;
          });
        } else if (wasPassed) {
          setPassedStatements((prev) => new Set([...prev, statementId]));
        }
        console.error("[DiscussViewContainer] Vote failed:", error);
      }
    },
    [viewModel.conversationId, viewModel.userVotes, passedStatements]
  );

  return (
    <DiscussView
      viewModel={viewModel}
      selectedStatementId={selectedStatementId}
      onSelectStatement={setSelectedStatementId}
      onVote={handleVote}
      isAdmin={isAdmin}
      interactedStatements={interactedStatements}
      passedStatements={passedStatements}
    />
  );
}
