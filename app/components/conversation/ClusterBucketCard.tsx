"use client";

/**
 * ClusterBucketCard - Expandable Cluster Bucket Component
 *
 * Displays an LLM-generated semantic bucket with:
 * - Consolidated statement (synthesized from similar responses)
 * - Bucket name label
 * - Voting buttons for the consolidated statement (using first response as representative)
 * - Expand/collapse toggle to show original responses (lazy-loaded on demand)
 *
 * Follows SRP: UI only, business logic in useBucketResponses hook
 */

import { useState, useCallback } from "react";
import { CaretDown, SpinnerGap } from "@phosphor-icons/react";
import type { ClusterBucket, Feedback, FeedbackItem, BucketResponse } from "@/types/conversation-understand";
import { getTagColors } from "@/lib/conversations/domain/tags";
import { useBucketResponses } from "@/lib/conversations/react/useBucketResponses";
import Button from "@/app/components/button";

export interface ClusterBucketCardProps {
  bucket: ClusterBucket;
  /** Conversation ID for fetching responses */
  conversationId: string;
  themeColor?: string;
  /** Callback to submit a vote on a response */
  onVote?: (responseId: string, feedback: Feedback) => void;
  /** ID of the response currently being voted on (for loading state) */
  loadingId?: string | null;
  /** Conversation type determines if voting is enabled */
  conversationType?: "understand" | "decide";
  /** Map of response IDs to their feedback items (for vote state) */
  feedbackById?: Map<string, FeedbackItem>;
}

export default function ClusterBucketCard({
  bucket,
  conversationId,
  themeColor,
  onVote,
  loadingId,
  conversationType = "understand",
  feedbackById,
}: ClusterBucketCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { bucketId, bucketName, consolidatedStatement, responseIds, responseCount } = bucket;

  // Lazy-load responses when expanded
  const {
    responses: loadedResponses,
    isLoading: isLoadingResponses,
    error: responsesError,
    hasMore,
    total,
    loadResponses,
    loadMore,
  } = useBucketResponses({
    conversationId,
    bucketId,
    pageSize: 20,
  });

  // Track if we've loaded responses at least once
  const hasLoadedOnce = total > 0 || loadedResponses.length > 0;

  // Handle toggle - load responses on first expand
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => {
      const willExpand = !prev;
      // Load responses when expanding for the first time
      if (willExpand && !hasLoadedOnce && responseIds.length > 0 && !isLoadingResponses) {
        loadResponses();
      }
      return willExpand;
    });
  }, [hasLoadedOnce, responseIds.length, isLoadingResponses, loadResponses]);

  // Use loaded responses or empty array
  const responses: BucketResponse[] = loadedResponses;

  // Use the first response ID as the representative for voting
  // Note: We use responseIds (always available) for voting, not loaded responses
  const representativeId = responseIds[0];
  const representativeFeedback = representativeId && feedbackById
    ? feedbackById.get(representativeId)
    : null;

  // Calculate aggregate feedback counts from all responses in the bucket using responseIds
  // This works even before responses are loaded since feedbackById has all feedback data
  const aggregateCounts = { agree: 0, pass: 0, disagree: 0 };
  if (feedbackById) {
    for (const responseId of responseIds) {
      const fb = feedbackById.get(responseId);
      if (fb) {
        aggregateCounts.agree += fb.counts.agree;
        aggregateCounts.pass += fb.counts.pass;
        aggregateCounts.disagree += fb.counts.disagree;
      }
    }
  }

  const showVoting = conversationType === "understand" && onVote && representativeId;

  return (
    <div className="rounded-2xl space-y-3">
      {/* Header with bucket name */}
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center text-base font-display font-medium rounded-full"
          style={{ color: themeColor || "#4F46E5" }}
        >
          {bucketName}
        </span>
        {aggregateCounts.agree + aggregateCounts.pass + aggregateCounts.disagree > 0 && (
          <span className="text-info text-slate-500">
            {aggregateCounts.agree} agree · {aggregateCounts.pass} pass · {aggregateCounts.disagree} disagree
          </span>
        )}
      </div>

      {/* Consolidated statement */}
      <p className="text-subtitle text-slate-800 leading-relaxed">
        {consolidatedStatement}
      </p>

      {/* Voting buttons */}
      {showVoting && (
        <div className="flex gap-2">
          {(["agree", "pass", "disagree"] as Feedback[]).map((fb) => {
            const active = representativeFeedback?.current === fb;

            const activeStyles =
              fb === "agree"
                ? "!bg-emerald-100 !text-emerald-800 !border-emerald-300 hover:!bg-emerald-200"
                : fb === "disagree"
                  ? "!bg-orange-100 !text-orange-800 !border-orange-300 hover:!bg-orange-200"
                  : "!bg-slate-200 !text-slate-800 !border-slate-300 hover:!bg-slate-300";
            const inactiveStyles =
              "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50";

            return (
              <Button
                key={fb}
                variant="secondary"
                size="sm"
                disabled={loadingId === representativeId}
                onClick={() => onVote(representativeId, fb)}
                className={`flex-1 transition-colors ${active ? activeStyles : inactiveStyles}`}
              >
                {fb === "agree" && "Agree"}
                {fb === "pass" && "Pass"}
                {fb === "disagree" && "Disagree"}
              </Button>
            );
          })}
        </div>
      )}

      {/* Expand/collapse toggle for original responses */}
      {responseCount > 0 && (
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="w-full flex items-center justify-between gap-2 text-slate-500 hover:bg-slate-100 px-3 py-2.5 rounded-lg transition"
          >
            <span className="text-info">
              {isExpanded ? "Hide" : "Show"} {responseCount} original{" "}
              {responseCount === 1 ? "response" : "responses"}
            </span>
            {isLoadingResponses && !hasLoadedOnce ? (
              <SpinnerGap
                size={14}
                weight="bold"
                className="animate-spin text-slate-400"
              />
            ) : (
              <CaretDown
                size={14}
                weight="bold"
                className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
            )}
          </Button>

          {/* Expanded original responses */}
          {isExpanded && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-indigo-200">
              {/* Loading state for initial load */}
              {isLoadingResponses && responses.length === 0 && (
                <div className="flex items-center gap-2 py-2 text-slate-500">
                  <SpinnerGap size={16} className="animate-spin" />
                  <span className="text-sm">Loading responses...</span>
                </div>
              )}

              {/* Error state */}
              {responsesError && (
                <div className="py-2 text-sm text-red-600">
                  Failed to load responses. Please try again.
                </div>
              )}

              {/* Responses list */}
              {responses.map((response) => (
                <div key={response.id} className="space-y-1">
                  {response.tag && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-label rounded-full border ${getTagColors(
                        response.tag
                      )}`}
                    >
                      {response.tag}
                    </span>
                  )}
                  <p className="text-body text-slate-700 leading-relaxed">
                    {response.responseText}
                  </p>
                </div>
              ))}

              {/* Load more button */}
              {hasMore && !isLoadingResponses && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMore}
                  className="w-full text-slate-500 hover:bg-slate-100 py-2"
                >
                  Load more responses
                </Button>
              )}

              {/* Loading more indicator */}
              {isLoadingResponses && responses.length > 0 && (
                <div className="flex items-center justify-center gap-2 py-2 text-slate-500">
                  <SpinnerGap size={16} className="animate-spin" />
                  <span className="text-sm">Loading more...</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
