"use client";

/**
 * ClusterBucketCard - Expandable Cluster Bucket Component
 *
 * Displays an LLM-generated semantic bucket with:
 * - Consolidated statement (synthesized from similar responses)
 * - Bucket name label
 * - Expand/collapse toggle to show original responses
 *
 * Follows SRP: UI only, no business logic
 */

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { ClusterBucket } from "@/types/conversation-understand";
import { getTagColors } from "@/lib/conversations/domain/tags";
import Button from "@/app/components/button";

export interface ClusterBucketCardProps {
  bucket: ClusterBucket;
  themeColor?: string;
}

export default function ClusterBucketCard({
  bucket,
  themeColor,
}: ClusterBucketCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { bucketName, consolidatedStatement, responses, responseCount } = bucket;

  return (
    <div className="rounded-2xl space-y-3">
      {/* Header with bucket name */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center py-1 text-label rounded-full"
            style={{ color: themeColor || "#4F46E5" }}
          >
            {bucketName}
          </span>
          <span className="text-info text-slate-400">
            ({responseCount} {responseCount === 1 ? "response" : "responses"})
          </span>
        </div>
      </div>

      {/* Consolidated statement */}
      <p className="text-subtitle text-slate-800 leading-relaxed">
        {consolidatedStatement}
      </p>

      {/* Expand/collapse toggle for original responses */}
      {responses.length > 0 && (
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-indigo-700 hover:bg-indigo-100 px-3 py-2 rounded-lg transition"
          >
            <span className="text-subtitle">
              {isExpanded ? "Hide" : "Show"} {responses.length} original{" "}
              {responses.length === 1 ? "response" : "responses"}
            </span>
            <CaretDown
              size={16}
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
