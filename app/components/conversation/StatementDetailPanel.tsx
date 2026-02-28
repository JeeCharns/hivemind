"use client";

/**
 * StatementDetailPanel - Client Component
 *
 * Detail view for a selected statement
 * Shows statement title, text, vote slider, and comments
 */

import type { DeliberateStatement, VoteValue } from "@/types/deliberate-space";
import VoteSlider from "./VoteSlider";
import DeliberateCommentList from "./DeliberateCommentList";

interface StatementDetailPanelProps {
  statement: DeliberateStatement;
  currentVote: VoteValue | null;
  onVote: (value: VoteValue | null) => void;
  conversationId: string;
  themeColor?: string;
  hasVoted?: boolean;
}

export default function StatementDetailPanel({
  statement,
  currentVote,
  onVote,
  conversationId,
  themeColor = "#5A54D4",
  hasVoted = false,
}: StatementDetailPanelProps) {
  return (
    <div className="p-6 space-y-6">
      {/* Coloured title */}
      {statement.statementTitle && (
        <h3
          className="text-lg font-display font-medium"
          style={{ color: themeColor }}
        >
          {statement.statementTitle}
        </h3>
      )}

      {/* Statement text */}
      <p className="text-title text-text-primary leading-relaxed">
        {statement.statementText}
      </p>

      {/* Vote slider */}
      <div className="max-w-lg">
        <VoteSlider value={currentVote} onChange={onVote} />
      </div>

      {/* Comments section */}
      <div className="pt-4">
        <DeliberateCommentList
          statementId={statement.id}
          conversationId={conversationId}
          disabled={!hasVoted}
        />
      </div>
    </div>
  );
}
