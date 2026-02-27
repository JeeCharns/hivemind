"use client";

/**
 * DiscussViewContainer - Client Component
 *
 * Container component for the Discuss tab that manages state and API interactions
 * Handles voting with optimistic updates
 */

import { useState, useCallback } from "react";
import type { DeliberateViewModel, VoteValue } from "@/types/deliberate-space";
import DiscussView from "./DiscussView";

interface DiscussViewContainerProps {
  initialViewModel: DeliberateViewModel;
}

export default function DiscussViewContainer({
  initialViewModel,
}: DiscussViewContainerProps) {
  const [viewModel, setViewModel] = useState(initialViewModel);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(
    null
  );

  const handleVote = useCallback(
    async (statementId: string, voteValue: VoteValue | null) => {
      const previousVote = viewModel.userVotes[statementId] ?? null;

      // Optimistic update
      setViewModel((prev) => ({
        ...prev,
        userVotes: { ...prev.userVotes, [statementId]: voteValue },
      }));

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
          userVotes: { ...prev.userVotes, [statementId]: previousVote },
        }));
        console.error("[DiscussViewContainer] Vote failed:", error);
      }
    },
    [viewModel.conversationId, viewModel.userVotes]
  );

  return (
    <DiscussView
      viewModel={viewModel}
      selectedStatementId={selectedStatementId}
      onSelectStatement={setSelectedStatementId}
      onVote={handleVote}
    />
  );
}
