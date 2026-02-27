"use client";

/**
 * StatementDetailPanel - Client Component
 *
 * Detail view for a selected statement
 * Shows statement text, vote slider, original responses toggle, and comments
 */

import { useState } from "react";
import type { DeliberateStatement, VoteValue } from "@/types/deliberate-space";
import VoteSlider from "./VoteSlider";
import DeliberateCommentList from "./DeliberateCommentList";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

interface StatementDetailPanelProps {
  statement: DeliberateStatement;
  currentVote: VoteValue | null;
  onVote: (value: VoteValue | null) => void;
  conversationId: string;
}

export default function StatementDetailPanel({
  statement,
  currentVote,
  onVote,
  conversationId,
}: StatementDetailPanelProps) {
  const [showOriginalResponses, setShowOriginalResponses] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <p className="text-title text-text-primary leading-relaxed">
        {statement.statementText}
      </p>

      <div className="max-w-md">
        <VoteSlider value={currentVote} onChange={onVote} />
      </div>

      {statement.sourceBucketId && (
        <div className="border-t border-border-secondary pt-4">
          <button
            type="button"
            onClick={() => setShowOriginalResponses(!showOriginalResponses)}
            className="flex items-center gap-2 text-body text-text-secondary hover:text-text-primary"
          >
            {showOriginalResponses ? (
              <CaretUp size={16} />
            ) : (
              <CaretDown size={16} />
            )}
            Show original responses
          </button>
          {showOriginalResponses && (
            <div className="mt-4 pl-4 border-l-2 border-border-secondary">
              <p className="text-info text-text-tertiary">
                Original responses will load here
              </p>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border-secondary pt-6">
        <DeliberateCommentList
          statementId={statement.id}
          conversationId={conversationId}
        />
      </div>
    </div>
  );
}
