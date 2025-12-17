"use client";

/**
 * VoteViewContainer - Client wrapper for VoteView
 *
 * Handles API calls for voting actions
 */

import { useRouter } from "next/navigation";
import VoteView, { type Proposal } from "./VoteView";

export interface VoteViewContainerProps {
  conversationId: string;
  proposals: Proposal[];
  totalCreditsSpent: number;
  remainingCredits: number;
}

export default function VoteViewContainer({
  conversationId,
  proposals,
  totalCreditsSpent,
  remainingCredits,
}: VoteViewContainerProps) {
  const router = useRouter();

  const handleVote = async (proposalId: string, delta: 1 | -1) => {
    const response = await fetch(
      `/api/conversations/${conversationId}/votes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: proposalId, delta }),
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
    <VoteView
      proposals={proposals}
      totalCreditsSpent={totalCreditsSpent}
      remainingCredits={remainingCredits}
      onVote={handleVote}
    />
  );
}
