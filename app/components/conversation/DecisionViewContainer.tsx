"use client";

/**
 * DecisionViewContainer - Client wrapper for DecisionView
 *
 * Handles API calls for voting actions
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DecisionView from "./DecisionView";
import type { DecisionViewModel } from "@/lib/decision-space/server/getDecisionViewModel";

export interface DecisionViewContainerProps {
  viewModel: DecisionViewModel;
  activeTab?: "vote" | "results";
}

export default function DecisionViewContainer({
  viewModel,
  activeTab = "vote",
}: DecisionViewContainerProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isClosingRound, setIsClosingRound] = useState(false);

  const handleVote = async (proposalId: string, delta: 1 | -1) => {
    if (!viewModel.currentRound) {
      throw new Error("No active voting round");
    }

    const response = await fetch(
      `/api/decision-space/${viewModel.conversationId}/vote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: viewModel.currentRound.id,
          proposalId,
          delta,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to vote");
    }

    // Refresh the page to get updated vote counts
    router.refresh();
  };

  const handleVoteError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    // Auto-clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  }, []);

  const handleClearError = useCallback(() => {
    setError(null);
  }, []);

  const handleCloseRound = async () => {
    if (!viewModel.currentRound) {
      throw new Error("No active voting round");
    }

    setIsClosingRound(true);
    try {
      const response = await fetch(
        `/api/decision-space/${viewModel.conversationId}/rounds/${viewModel.currentRound.id}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to close round");
      }

      // Refresh the page to get updated state
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to close round";
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsClosingRound(false);
    }
  };

  return (
    <DecisionView
      viewModel={viewModel}
      activeTab={activeTab}
      onVote={handleVote}
      onCloseRound={handleCloseRound}
      isClosingRound={isClosingRound}
      error={error}
      onVoteError={handleVoteError}
      onClearError={handleClearError}
    />
  );
}
