"use client";

/**
 * FrequentlyMentionedGroupCard - Expandable Group Card Component
 *
 * Displays a "frequently mentioned" group with:
 * - Representative response (most characteristic)
 * - Voting buttons (agree/pass/disagree) on representative
 * - Expand/collapse toggle to show similar responses
 * - Badge showing group size
 *
 * Follows SRP: UI only, voting logic passed via props
 */

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type {
  FrequentlyMentionedGroup,
  Feedback,
} from "@/types/conversation-understand";
import { getTagColors } from "@/lib/conversations/domain/tags";
import Button from "@/app/components/button";

export interface FrequentlyMentionedGroupCardProps {
  group: FrequentlyMentionedGroup;
  onVote: (responseId: string, feedback: Feedback) => void;
  loadingId?: string | null;
  conversationType?: "understand" | "decide";
}

export default function FrequentlyMentionedGroupCard({
  group,
  onVote,
  loadingId,
  conversationType = "understand",
}: FrequentlyMentionedGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { representative, similarResponses } = group;

  return (
    <div className="rounded-2xl space-y-3">
      {/* Header with badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center py-1 text-label rounded-full text-indigo-700">
            Frequently mentioned
          </span>
          {representative.tag && (
            <span
              className={`inline-flex items-center px-2 py-0.5 text-label rounded-full border ${getTagColors(
                representative.tag
              )}`}
            >
              {representative.tag}
            </span>
          )}
        </div>
        <span className="text-info text-slate-500">
          {representative.counts.agree} agree · {representative.counts.pass}{" "}
          pass · {representative.counts.disagree} disagree
        </span>
      </div>

      {/* Representative response text */}
      <p className="text-subtitle text-slate-800 leading-relaxed">
        {representative.responseText}
      </p>

      {/* Voting buttons */}
      {conversationType === "understand" && (
        <div className="flex gap-2">
          {(["agree", "pass", "disagree"] as Feedback[]).map((fb) => {
            const active = representative.current === fb;
            const activeStyles =
              fb === "agree"
                ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                : fb === "disagree"
                  ? "bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-100"
                  : "bg-slate-200 text-slate-800 border-slate-300 hover:bg-slate-200";
            const inactiveStyles =
              "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50";
            return (
              <Button
                key={fb}
                variant="secondary"
                size="sm"
                disabled={loadingId === representative.id}
                onClick={() => onVote(representative.id, fb)}
                className={`flex-1 transition-colors ${
                  active ? activeStyles : inactiveStyles
                }`}
              >
                {fb === "agree" && "Agree"}
                {fb === "pass" && "Pass"}
                {fb === "disagree" && "Disagree"}
              </Button>
            );
          })}
        </div>
      )}

      {conversationType === "decide" && (
        <p className="text-info text-slate-500 italic mt-1">
          Feedback disabled for decision sessions
        </p>
      )}

      {/* Expand/collapse toggle */}
      {similarResponses.length > 0 && (
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-indigo-700 hover:bg-indigo-100 px-3 py-2 rounded-lg transition"
          >
            <span className="text-subtitle">
              {isExpanded ? "Hide" : "Show"} {similarResponses.length} similar{" "}
              {similarResponses.length === 1 ? "response" : "responses"}
            </span>
            <CaretDown
              size={16}
              weight="bold"
              className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </Button>

          {/* Expanded similar responses */}
          {isExpanded && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-indigo-200">
              {similarResponses.map((similar) => (
                <div key={similar.id} className="space-y-1">
                  {similar.tag && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-label rounded-full border ${getTagColors(
                        similar.tag
                      )}`}
                    >
                      {similar.tag}
                    </span>
                  )}
                  <p className="text-body text-slate-700 leading-relaxed">
                    {similar.responseText}
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
