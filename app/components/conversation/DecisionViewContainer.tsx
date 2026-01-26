"use client";

/**
 * DecisionViewContainer - Client wrapper for DecisionView
 *
 * Handles API calls for voting actions
 */

import { useRouter } from "next/navigation";
import DecisionView from "./DecisionView";
import type { DecisionViewModel } from "@/lib/decision-space/server/getDecisionViewModel";

export interface DecisionViewContainerProps {
  viewModel: DecisionViewModel;
}

export default function DecisionViewContainer({
  viewModel,
}: DecisionViewContainerProps) {
  const router = useRouter();

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
      const error = await response.json();
      throw new Error(error.error || "Failed to vote");
    }

    // Refresh the page to get updated vote counts
    router.refresh();
  };

  return (
    <DecisionView
      viewModel={viewModel}
      onVote={handleVote}
    />
  );
}
