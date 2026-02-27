"use client";

/**
 * StatementListCard - Client Component
 *
 * Compact card showing a statement in the list view
 * Displays statement text, vote count, and comment count
 */

import type { DeliberateStatement } from "@/types/deliberate-space";
import { ThumbsUp, ChatCircle } from "@phosphor-icons/react";

interface StatementListCardProps {
  statement: DeliberateStatement;
  isSelected: boolean;
  onClick: () => void;
}

export default function StatementListCard({
  statement,
  isSelected,
  onClick,
}: StatementListCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isSelected
          ? "border-brand-primary bg-brand-primary/5"
          : "border-border-secondary hover:border-border-primary hover:bg-surface-secondary"
      }`}
    >
      <p className="text-body text-text-primary line-clamp-2 mb-2">
        {statement.statementText}
      </p>
      <div className="flex items-center gap-4 text-info text-text-tertiary">
        <span className="flex items-center gap-1">
          <ThumbsUp size={14} />
          {statement.voteCount}
        </span>
        <span className="flex items-center gap-1">
          <ChatCircle size={14} />
          {statement.commentCount}
        </span>
      </div>
    </button>
  );
}
