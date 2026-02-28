"use client";

/**
 * StatementDetailPanel - Client Component
 *
 * Detail view for a selected statement
 * Shows statement title, text, vote slider, and comments
 */

import type { DeliberateStatement, VoteValue } from "@/types/deliberate-space";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import VoteSlider from "./VoteSlider";
import DeliberateCommentList from "./DeliberateCommentList";

interface StatementDetailPanelProps {
  statement: DeliberateStatement;
  currentVote: VoteValue | null;
  onVote: (value: VoteValue | null) => void;
  conversationId: string;
  themeColor?: string;
  hasVoted?: boolean;
  /** Whether the user has passed on this statement */
  hasPassed?: boolean;
  /** Whether the current user is an admin (can moderate comments) */
  isAdmin?: boolean;
  /** Number of statements the user hasn't voted on yet */
  unvotedCount?: number;
  /** Navigate to previous statement */
  onPrevious?: () => void;
  /** Navigate to next statement */
  onNext?: () => void;
  /** Whether previous button should be enabled */
  canGoPrevious?: boolean;
  /** Whether next button should be enabled */
  canGoNext?: boolean;
}

export default function StatementDetailPanel({
  statement,
  currentVote,
  onVote,
  conversationId,
  themeColor = "#5A54D4",
  hasVoted = false,
  hasPassed = false,
  isAdmin = false,
  unvotedCount = 0,
  onPrevious,
  onNext,
  canGoPrevious = false,
  canGoNext = false,
}: StatementDetailPanelProps) {
  return (
    <div className="p-8 space-y-6">
      {/* Navigation header with Previous / Title / Next */}
      <div className="flex items-center justify-between">
        {/* Previous button */}
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-slate-200 rounded-lg text-text-secondary hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <CaretLeft size={16} />
          Previous
        </button>

        {/* Centred title */}
        {statement.statementTitle && (
          <h3
            className="text-lg font-display font-medium text-center flex-1 mx-4"
            style={{ color: themeColor }}
          >
            {statement.statementTitle}
          </h3>
        )}

        {/* Next button with unvoted count */}
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-slate-200 rounded-lg text-text-secondary hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Next {unvotedCount > 0 && `(${unvotedCount})`}
          <CaretRight size={16} />
        </button>
      </div>

      {/* Statement text */}
      <p className="text-title text-text-primary leading-relaxed">
        {statement.statementText}
      </p>

      {/* Vote slider */}
      <VoteSlider value={currentVote} onChange={onVote} hasPassed={hasPassed} />

      {/* Comments section */}
      <div className="pt-4">
        <DeliberateCommentList
          statementId={statement.id}
          conversationId={conversationId}
          disabled={!hasVoted}
          isAdmin={isAdmin}
          voteCount={statement.voteCount}
        />
      </div>
    </div>
  );
}
