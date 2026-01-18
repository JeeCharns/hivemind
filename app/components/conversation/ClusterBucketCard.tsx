"use client";

/**
 * ClusterBucketCard - Expandable Cluster Bucket Component
 *
 * Displays an LLM-generated semantic bucket with:
 * - Consolidated statement (synthesized from similar responses)
 * - Bucket name label
 * - Voting buttons for the consolidated statement (using first response as representative)
 * - Expand/collapse toggle to show original responses
 *
 * Follows SRP: UI only, no business logic
 */

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { ClusterBucket, Feedback, FeedbackItem } from "@/types/conversation-understand";
import { getTagColors } from "@/lib/conversations/domain/tags";
import Button from "@/app/components/button";

export interface ClusterBucketCardProps {
  bucket: ClusterBucket;
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
  themeColor,
  onVote,
  loadingId,
  conversationType = "understand",
  feedbackById,
}: ClusterBucketCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { bucketName, consolidatedStatement, responses, responseCount } = bucket;

  // Use the first response as the representative for voting
  const representativeResponse = responses[0];
  const representativeFeedback = representativeResponse && feedbackById
    ? feedbackById.get(representativeResponse.id)
    : null;

  // Calculate aggregate feedback counts from all responses in the bucket
  const aggregateCounts = { agree: 0, pass: 0, disagree: 0 };
  if (feedbackById) {
    for (const response of responses) {
      const fb = feedbackById.get(response.id);
      if (fb) {
        aggregateCounts.agree += fb.counts.agree;
        aggregateCounts.pass += fb.counts.pass;
        aggregateCounts.disagree += fb.counts.disagree;
      }
    }
  }

  const showVoting = conversationType === "understand" && onVote && representativeResponse;

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
                disabled={loadingId === representativeResponse.id}
                onClick={() => onVote(representativeResponse.id, fb)}
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
      {responses.length > 0 && (
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between gap-2 text-slate-500 hover:bg-slate-100 px-3 py-2.5 rounded-lg transition"
          >
            <span className="text-info">
              {isExpanded ? "Hide" : "Show"} {responses.length} original{" "}
              {responses.length === 1 ? "response" : "responses"}
            </span>
            <CaretDown
              size={14}
              weight="bold"
              className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </Button>

          {/* Expanded original responses */}
          {isExpanded && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-indigo-200">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
