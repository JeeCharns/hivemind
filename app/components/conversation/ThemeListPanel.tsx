"use client";

/**
 * ThemeListPanel - Reusable Theme/Cluster List Component
 *
 * Displays clusters with bucket/statement pills in overview mode,
 * and expanded bucket cards in drilled-in mode.
 * Used by both UnderstandView and DiscussView.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import Button from "@/app/components/button";
import { CaretDown, SpinnerGap } from "@phosphor-icons/react";
import { useBucketResponses } from "@/lib/conversations/react/useBucketResponses";

// Color palette matching UnderstandView
const palette = [
  "#5A54D4", // soft indigo
  "#2A9BD4", // soft blue
  "#36B86A", // soft green
  "#E8A832", // soft amber
  "#E05858", // soft red
  "#8E6FE8", // soft purple
  "#E0609A", // soft pink
  "#28B0A0", // soft teal
];

export interface ThemeListCluster {
  index: number | null;
  name: string | null;
  description?: string;
}

export interface ThemeListBucket {
  id: string;
  clusterIndex: number | null;
  bucketName: string;
  consolidatedStatement: string;
  /** Number of original responses in the source bucket */
  responseCount?: number;
  /** Source bucket ID for fetching original responses */
  sourceBucketId?: string;
  /** Source conversation ID for fetching original responses */
  sourceConversationId?: string;
}

export interface ThemeListPanelProps {
  clusters: ThemeListCluster[];
  buckets: ThemeListBucket[];
  /** Currently hovered cluster index (for map sync) */
  hoveredCluster?: number | null;
  /** Callback when cluster hover changes */
  onHoverCluster?: (index: number | null) => void;
  /** Callback when a bucket is selected */
  onSelectBucket?: (bucketId: string) => void;
  /** Currently selected bucket ID */
  selectedBucketId?: string | null;
  /** Empty state message */
  emptyMessage?: string;
}

/** Internal component for expandable bucket cards with original responses */
function ExpandableBucketCard({
  bucket,
  themeColor,
  isSelected,
  onSelect,
}: {
  bucket: ThemeListBucket;
  themeColor: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Only use the hook if we have source data
  const canExpand =
    bucket.sourceBucketId &&
    bucket.sourceConversationId &&
    bucket.responseCount &&
    bucket.responseCount > 0;

  const {
    responses,
    isLoading,
    error,
    hasMore,
    total,
    loadResponses,
    loadMore,
  } = useBucketResponses({
    conversationId: bucket.sourceConversationId || "",
    bucketId: bucket.sourceBucketId || "",
    pageSize: 20,
  });

  const hasLoadedOnce = total > 0 || responses.length > 0;

  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canExpand) return;

      setIsExpanded((prev) => {
        const willExpand = !prev;
        if (willExpand && !hasLoadedOnce && !isLoading) {
          loadResponses();
        }
        return willExpand;
      });
    },
    [canExpand, hasLoadedOnce, isLoading, loadResponses]
  );

  return (
    <div
      className={`w-full text-left rounded-2xl space-y-3 p-4 transition-all ${
        isSelected ? "bg-slate-50 ring-2 ring-slate-200" : "hover:bg-slate-50"
      }`}
    >
      {/* Clickable header area for selection */}
      <button
        type="button"
        className="w-full text-left"
        onClick={onSelect}
      >
        {/* Bucket name as title */}
        <div
          className="text-base font-display font-medium"
          style={{ color: themeColor }}
        >
          {bucket.bucketName}
        </div>

        {/* Consolidated statement */}
        <p className="text-subtitle text-slate-800 leading-relaxed mt-3">
          {bucket.consolidatedStatement}
        </p>
      </button>

      {/* Show original responses toggle (if has responses) */}
      {canExpand && (
        <div className="pt-2">
          <button
            type="button"
            onClick={handleToggleExpand}
            className="w-full flex items-center justify-center gap-2 text-slate-500 hover:bg-slate-100 px-3 py-2.5 rounded-lg transition"
          >
            <span className="text-info">
              {isExpanded ? "Hide" : "Show"} {bucket.responseCount} original{" "}
              {bucket.responseCount === 1 ? "response" : "responses"}
            </span>
            {isLoading && !hasLoadedOnce ? (
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
          </button>

          {/* Expanded original responses */}
          {isExpanded && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-indigo-200">
              {/* Loading state for initial load */}
              {isLoading && responses.length === 0 && (
                <div className="flex items-center gap-2 py-2 text-slate-500">
                  <SpinnerGap size={16} className="animate-spin" />
                  <span className="text-sm">Loading responses...</span>
                </div>
              )}

              {/* Error state */}
              {error && (
                <div className="py-2 text-sm text-red-600">
                  Failed to load responses. Please try again.
                </div>
              )}

              {/* Responses list */}
              {responses.map((response) => (
                <div key={response.id} className="space-y-1">
                  <p className="text-body text-slate-700 leading-relaxed">
                    {response.responseText}
                  </p>
                </div>
              ))}

              {/* Load more button */}
              {hasMore && !isLoading && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadMore();
                  }}
                  className="w-full text-slate-500 hover:bg-slate-100 py-2 text-sm rounded-lg"
                >
                  Load more responses
                </button>
              )}

              {/* Loading more indicator */}
              {isLoading && responses.length > 0 && (
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

export default function ThemeListPanel({
  clusters,
  buckets,
  hoveredCluster,
  onHoverCluster,
  onSelectBucket,
  selectedBucketId,
  emptyMessage = "No items yet.",
}: ThemeListPanelProps) {
  type SelectedTheme = "all" | number | null;
  const [selectedTheme, setSelectedTheme] = useState<SelectedTheme>("all");

  // When selected bucket changes, ensure its cluster is visible
  useEffect(() => {
    if (!selectedBucketId) return;

    const selectedBucket = buckets.find((b) => b.id === selectedBucketId);
    if (!selectedBucket) return;

    const bucketClusterIndex = selectedBucket.clusterIndex;

    // If we're in "all" view or the bucket is in a different cluster, switch to that cluster
    if (selectedTheme === "all" || selectedTheme !== bucketClusterIndex) {
      setSelectedTheme(bucketClusterIndex);
    }
  }, [selectedBucketId, buckets, selectedTheme]);

  const getThemeColor = useCallback((clusterIndex: number | null) => {
    if (clusterIndex === null) return "#94a3b8";
    return palette[clusterIndex % palette.length];
  }, []);

  // Build cluster summaries
  const clusterSummaries = useMemo(() => {
    const summaries: Array<{
      key: string;
      clusterIndex: number | null;
      title: string;
      description?: string;
      bucketNames: string[];
      bucketCount: number;
      filterValue: number | null;
    }> = [];

    for (const cluster of clusters) {
      const clusterBuckets = buckets.filter(
        (b) => b.clusterIndex === cluster.index
      );
      summaries.push({
        key: cluster.index !== null ? `cluster-${cluster.index}` : "unclustered",
        clusterIndex: cluster.index,
        title: cluster.name || "Unclustered",
        description: cluster.description,
        bucketNames: clusterBuckets.map((b) => b.bucketName),
        bucketCount: clusterBuckets.length,
        filterValue: cluster.index,
      });
    }

    return summaries;
  }, [clusters, buckets]);

  // Get selected theme label
  const selectedThemeLabel = useMemo(() => {
    if (selectedTheme === "all") return "All themes";
    const cluster = clusters.find((c) => c.index === selectedTheme);
    return cluster?.name || "Unclustered";
  }, [selectedTheme, clusters]);

  // Filter buckets for selected theme
  const filteredBuckets = useMemo(() => {
    if (selectedTheme === "all") return [];
    return buckets.filter((b) => b.clusterIndex === selectedTheme);
  }, [buckets, selectedTheme]);

  if (clusters.length === 0) {
    return (
      <div className="text-body text-slate-600 text-center py-8">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back button and theme title - shown when viewing a specific theme */}
      {selectedTheme !== "all" && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="p-2! aspect-square"
            onClick={() => setSelectedTheme("all")}
            aria-label="Back to all themes"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Button>
          <span
            className="font-display text-lg font-medium"
            style={{ color: getThemeColor(selectedTheme) }}
          >
            {selectedThemeLabel}
          </span>
        </div>
      )}

      <div className={selectedTheme === "all" ? "space-y-6" : "space-y-8 pt-4"}>
        {selectedTheme === "all" ? (
          /* Cluster summary cards for "All themes" view */
          <>
            {clusterSummaries.map((summary) => {
              const themeColor = getThemeColor(summary.clusterIndex);

              return (
                <button
                  key={summary.key}
                  type="button"
                  className={`w-full text-left bg-white pl-3 space-y-2 transition-all cursor-pointer group ${
                    hoveredCluster === summary.clusterIndex
                      ? "border-l-4"
                      : "border-l-2 hover:border-l-4"
                  }`}
                  style={{ borderLeftColor: themeColor }}
                  onClick={() => setSelectedTheme(summary.filterValue)}
                  onMouseEnter={() => onHoverCluster?.(summary.clusterIndex)}
                  onMouseLeave={() => onHoverCluster?.(null)}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="text-label uppercase tracking-[0.04em]"
                      style={{ color: themeColor }}
                    >
                      {summary.title}
                    </div>
                    <span className="text-xs text-slate-400 underline group-hover:text-slate-600 transition-colors">
                      Show {summary.bucketCount} statement
                      {summary.bucketCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {summary.bucketNames.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {summary.bucketNames.map((name, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700 border border-slate-200"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : summary.description ? (
                    <p className="text-body text-slate-800 leading-relaxed">
                      {summary.description}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </>
        ) : (
          /* Bucket cards for filtered view */
          <>
            {filteredBuckets.map((bucket) => (
              <ExpandableBucketCard
                key={bucket.id}
                bucket={bucket}
                themeColor={getThemeColor(bucket.clusterIndex)}
                isSelected={bucket.id === selectedBucketId}
                onSelect={() => onSelectBucket?.(bucket.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
