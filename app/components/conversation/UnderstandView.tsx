"use client";

/**
 * UnderstandView - Understand Tab Client Component
 *
 * Left: Interactive theme map with UMAP points and cluster rings
 * Right: Response list with feedback buttons (agree/pass/disagree)
 * Follows SRP: UI only, business logic in useConversationFeedback hook
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  UnderstandViewModel,
  ResponsePoint,
} from "@/types/conversation-understand";
import { useConversationFeedback } from "@/lib/conversations/react/useConversationFeedback";
import type { IConversationFeedbackClient } from "@/lib/conversations/data/feedbackClient";
import { getTagColors } from "@/lib/conversations/domain/tags";
import Button from "@/app/components/button";
import type { Feedback } from "@/types/conversation-understand";
import ClusterBucketCard from "./ClusterBucketCard";
import { MISC_CLUSTER_INDEX } from "@/lib/conversations/domain/thresholds";
import { generateClusterHullPath } from "@/lib/visualization/clusterHull";
import { buildClusterSummaries } from "@/lib/conversations/domain/buildClusterSummaries";
import type { AnalysisProgress } from "@/lib/conversations/react/useConversationAnalysisRealtime";
import type { AnalysisUiState } from "./UnderstandViewContainer";
import ClusterMapSkeleton from "./ClusterMapSkeleton";
import ClusterListSkeleton from "./ClusterListSkeleton";
import AnalysisProgressSteps from "./AnalysisProgressSteps";
import type { AnalysisProgressStage } from "@/lib/conversations/server/broadcastAnalysisStatus";

const palette = [
  "#4F46E5",
  "#0EA5E9",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
];

const MISC_COLOR = "#94a3b8"; // slate-400

const CANVAS_SIZE = 520;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.2;

// Zoom tiers for level-of-detail rendering
type ZoomTier = "far" | "medium" | "close";

const getZoomTier = (zoom: number): ZoomTier => {
  if (zoom < 0.8) return "far";
  if (zoom > 1.5) return "close";
  return "medium";
};

// Rendering configuration per zoom tier
const ZOOM_CONFIGS = {
  far: {
    dotRadius: 3,
    clusterStrokeWidth: 2,
    axisOpacity: 0.1,
  },
  medium: {
    dotRadius: 2,
    clusterStrokeWidth: 1,
    axisOpacity: 0.15,
  },
  close: {
    dotRadius: 2,
    clusterStrokeWidth: 1,
    axisOpacity: 0.2,
  },
} as const;

/**
 * Scale UMAP points to canvas coordinates
 */
const scalePoints = (points: ResponsePoint[], size = CANVAS_SIZE) => {
  // Filter out points without coordinates
  const validPoints = points.filter(
    (p) => p.xUmap !== null && p.yUmap !== null
  );

  if (validPoints.length === 0) {
    return [];
  }

  const xs = validPoints.map((p) => p.xUmap!);
  const ys = validPoints.map((p) => p.yUmap!);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 0;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return validPoints.map((p) => ({
    ...p,
    sx: ((p.xUmap! - minX) / rangeX) * (size - pad * 2) + pad,
    sy: ((p.yUmap! - minY) / rangeY) * (size - pad * 2) + pad,
  }));
};

export interface UnderstandViewProps {
  viewModel: UnderstandViewModel;
  conversationType?: "understand" | "decide";
  analysisInProgress?: boolean;
  analysisProgress?: AnalysisProgress | null;
  uiState?: AnalysisUiState;
  /** Optional custom feedback client (e.g. for guest mode) */
  feedbackClient?: IConversationFeedbackClient;
}

export default function UnderstandView({
  viewModel,
  conversationType = "understand",
  analysisInProgress = false,
  analysisProgress = null,
  uiState = "idle",
  feedbackClient,
}: UnderstandViewProps) {
  // Determine if we should show skeletons (during loading_results state)
  const showSkeletons = uiState === "loading_results";
  // Show progress overlay during starting or analysing states
  // Falls back to analysisInProgress for backward compatibility
  const showProgressOverlay =
    uiState === "starting" ||
    uiState === "analysing" ||
    (uiState === "idle" && analysisInProgress);
  const {
    conversationId,
    responses,
    themes,
    feedbackItems,
    clusterBuckets,
    unconsolidatedResponseIds,
  } = viewModel;

  // Filter state: "all" | "unclustered" | cluster index (number)
  type SelectedTheme = "all" | "unclustered" | number;
  const [selectedTheme, setSelectedTheme] = useState<SelectedTheme>("all");
  const [hoveredCluster, setHoveredCluster] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  // ViewBox state for semantic zoom (x, y, width, height in SVG coordinates)
  const initialViewBox = {
    x: 0,
    y: 0,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
  };
  const [viewBox, setViewBox] = useState(initialViewBox);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const viewBoxStart = useRef(initialViewBox);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { items, vote } = useConversationFeedback({
    conversationId,
    initialItems: feedbackItems,
    feedbackClient,
  });

  const points = useMemo(() => scalePoints(responses), [responses]);

  // Build cluster summaries for "All themes" view
  const clusterSummaries = useMemo(
    () =>
      buildClusterSummaries(
        responses,
        themes,
        items,
        clusterBuckets,
        unconsolidatedResponseIds
      ),
    [responses, themes, items, clusterBuckets, unconsolidatedResponseIds]
  );

  // Create a map of response IDs to feedback items for ClusterBucketCard voting
  const feedbackById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );

  // Determine current zoom tier for LOD rendering
  const zoomTier = useMemo(() => getZoomTier(zoom), [zoom]);
  const zoomConfig = ZOOM_CONFIGS[zoomTier];

  const clusters = useMemo(() => {
    const grouped: Record<
      number,
      { pts: ReturnType<typeof scalePoints>[number][] }
    > = {};
    points.forEach((p) => {
      if (p.clusterIndex === null) return;
      if (!grouped[p.clusterIndex]) grouped[p.clusterIndex] = { pts: [] };
      grouped[p.clusterIndex].pts.push(p);
    });
    return grouped;
  }, [points]);

  const clusterMeta = useMemo(() => {
    return Object.entries(clusters)
      .filter(([idx]) => Number(idx) !== MISC_CLUSTER_INDEX) // Exclude misc from cluster rings
      .map(([idx, { pts }]) => {
        const xs = pts.map((p) => p.sx!);
        const ys = pts.map((p) => p.sy!);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

        // Generate hull path for this cluster
        const hullPoints = pts.map((p) => ({ x: p.sx!, y: p.sy! }));
        const hullPath = generateClusterHullPath(hullPoints, 8, 0.3);

        const color = palette[Number(idx) % palette.length];
        const themeName =
          themes.find((t) => t.clusterIndex === Number(idx))?.name ??
          `Theme ${idx}`;
        return {
          idx: Number(idx),
          cx,
          cy,
          hullPath,
          color,
          themeName,
        };
      });
  }, [clusters, themes]);

  const filteredPoints = useMemo(() => {
    if (selectedTheme === "all") {
      return points;
    } else if (selectedTheme === "unclustered") {
      return points.filter((p) => p.clusterIndex === null);
    } else {
      return points.filter((p) => p.clusterIndex === selectedTheme);
    }
  }, [selectedTheme, points]);

  const filteredItems = useMemo(() => {
    if (selectedTheme === "all") {
      return items;
    } else if (selectedTheme === "unclustered") {
      return items.filter((r) => r.clusterIndex === null);
    } else {
      return items.filter((r) => r.clusterIndex === selectedTheme);
    }
  }, [selectedTheme, items]);

  // Debug logging
  if (typeof window !== "undefined" && selectedTheme !== "all") {
    console.log("[UnderstandView] Filter debug:", {
      selectedTheme,
      totalItems: items.length,
      filteredCount: filteredItems.length,
      clusterDistribution: items.reduce(
        (acc, item) => {
          const key = item.clusterIndex === null ? "null" : item.clusterIndex;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        },
        {} as Record<string | number, number>
      ),
    });
  }

  // Filter cluster buckets for selected theme (LLM-driven consolidation)
  const filteredBuckets = useMemo(() => {
    if (!clusterBuckets || clusterBuckets.length === 0) return [];
    if (selectedTheme === "all") return clusterBuckets;
    if (selectedTheme === "unclustered") return [];
    return clusterBuckets.filter((b) => b.clusterIndex === selectedTheme);
  }, [clusterBuckets, selectedTheme]);

  // Create set of grouped response IDs to avoid duplicate rendering
  const groupedResponseIds = useMemo(() => {
    const ids = new Set<string>();

    // Add IDs from cluster buckets
    filteredBuckets.forEach((bucket) => {
      bucket.responses.forEach((resp) => ids.add(resp.id));
    });

    return ids;
  }, [filteredBuckets]);

  // Filter out responses that are already in buckets
  // Show unconsolidated responses as "ungrouped"
  const ungroupedItems = useMemo(() => {
    const base = filteredItems.filter(
      (item) => !groupedResponseIds.has(item.id)
    );

    // Filter to only show unconsolidated items if we have that data
    if (unconsolidatedResponseIds && unconsolidatedResponseIds.length > 0) {
      const unconsolidatedSet = new Set(unconsolidatedResponseIds);
      return base.filter((item) => unconsolidatedSet.has(item.id));
    }

    return base;
  }, [filteredItems, groupedResponseIds, unconsolidatedResponseIds]);

  const svgRef = useRef<SVGSVGElement>(null);

  const onPanStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
    dragStart.current = { x: event.clientX, y: event.clientY };
    viewBoxStart.current = viewBox;
  };

  const onPanMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging || !svgRef.current) return;

    // Calculate pixel delta
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;

    // Convert pixel delta to SVG coordinate delta based on current viewBox
    // The conversion factor is viewBox width/height divided by the rendered pixel width/height
    const rect = svgRef.current.getBoundingClientRect();
    const svgDx = -(dx * viewBoxStart.current.width) / rect.width;
    const svgDy = -(dy * viewBoxStart.current.height) / rect.height;

    setViewBox({
      ...viewBoxStart.current,
      x: viewBoxStart.current.x + svgDx,
      y: viewBoxStart.current.y + svgDy,
    });
  };

  const onPanEnd = () => {
    setDragging(false);
  };

  const clamp = useCallback((value: number, min: number, max: number) => {
    return Math.min(max, Math.max(min, value));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((prevZoom) => {
      const newZoom = clamp(
        Number((prevZoom + ZOOM_STEP).toFixed(2)),
        MIN_ZOOM,
        MAX_ZOOM
      );
      if (newZoom === prevZoom) return prevZoom; // Already at max
      return newZoom;
    });

    setViewBox((prevViewBox) => {
      // Calculate zoom factor (zoom increases, viewBox shrinks)
      const zoomFactor = 1 / (1 + ZOOM_STEP);

      // Center of the current viewBox
      const centerX = prevViewBox.x + prevViewBox.width / 2;
      const centerY = prevViewBox.y + prevViewBox.height / 2;

      // New viewBox dimensions (smaller = more zoomed in)
      const newWidth = prevViewBox.width * zoomFactor;
      const newHeight = prevViewBox.height * zoomFactor;

      // Keep center point fixed
      return {
        x: centerX - newWidth / 2,
        y: centerY - newHeight / 2,
        width: newWidth,
        height: newHeight,
      };
    });
  }, [clamp]);

  const zoomOut = useCallback(() => {
    setZoom((prevZoom) => {
      const newZoom = clamp(
        Number((prevZoom - ZOOM_STEP).toFixed(2)),
        MIN_ZOOM,
        MAX_ZOOM
      );
      if (newZoom === prevZoom) return prevZoom; // Already at min
      return newZoom;
    });

    setViewBox((prevViewBox) => {
      // Calculate zoom factor (zoom decreases, viewBox grows)
      const zoomFactor = 1 + ZOOM_STEP;

      // Center of the current viewBox
      const centerX = prevViewBox.x + prevViewBox.width / 2;
      const centerY = prevViewBox.y + prevViewBox.height / 2;

      // New viewBox dimensions (larger = more zoomed out)
      const newWidth = prevViewBox.width * zoomFactor;
      const newHeight = prevViewBox.height * zoomFactor;

      // Keep center point fixed
      return {
        x: centerX - newWidth / 2,
        y: centerY - newHeight / 2,
        width: newWidth,
        height: newHeight,
      };
    });
  }, [clamp]);

  // ViewBox string for the SVG element
  const viewBoxString = useMemo(
    () => `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    [viewBox]
  );

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      window.addEventListener("click", handleClickAway);
    }
    return () => window.removeEventListener("click", handleClickAway);
  }, [dropdownOpen]);

  // Get theme color by cluster index
  const getThemeColor = useCallback((clusterIndex: number) => {
    if (clusterIndex === MISC_CLUSTER_INDEX) {
      return MISC_COLOR;
    }
    return palette[clusterIndex % palette.length];
  }, []);

  // Get selected theme label
  const selectedThemeLabel = useMemo(() => {
    if (selectedTheme === "all") return "All themes";
    if (selectedTheme === "unclustered") return "Unclustered/New responses";
    const theme = themes.find((t) => t.clusterIndex === selectedTheme);
    return theme?.name || `Theme ${selectedTheme}`;
  }, [selectedTheme, themes]);

  return (
    <div className="flex flex-col gap-6 pt-6 md:h-[calc(100vh-180px)] md:overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(200px,1fr)_minmax(320px,1fr)] gap-6 items-start md:flex-1 md:overflow-hidden">
        {/* Left column: Theme map - shrinks on tablet, square on mobile */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 relative aspect-square w-full md:aspect-auto md:h-full md:min-h-[300px]">
          {/* Skeleton overlay for loading_results state */}
          {showSkeletons && (
            <div className="absolute inset-0 z-30">
              <ClusterMapSkeleton />
            </div>
          )}
          {/* Progress overlay for starting/analysing states */}
          {showProgressOverlay && (
            <div className="absolute inset-0 bg-white/95 z-30 flex items-center justify-center backdrop-blur-sm">
              <div className="max-w-md mx-auto space-y-4 text-center p-8">
                <h2 className="text-xl font-semibold text-slate-800">
                  Updating Theme Map
                </h2>

                {/* Step-based progress display */}
                <AnalysisProgressSteps
                  progressStage={
                    analysisProgress?.progressStage as
                      | AnalysisProgressStage
                      | undefined
                  }
                  customMessage={analysisProgress?.progressMessage}
                  size="sm"
                />
              </div>
            </div>
          )}
          <div
            className={`relative bg-white rounded-xl h-full overflow-hidden ${
              dragging ? "cursor-grabbing" : "cursor-grab"
            }`}
            onMouseDown={onPanStart}
            onMouseMove={onPanMove}
            onMouseUp={onPanEnd}
            onMouseLeave={onPanEnd}
            suppressHydrationWarning
          >
            {mounted ? (
              <>
                <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      zoomOut();
                    }}
                    aria-label="Zoom out"
                    disabled={zoom <= MIN_ZOOM}
                  >
                    −
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      zoomIn();
                    }}
                    aria-label="Zoom in"
                    disabled={zoom >= MAX_ZOOM}
                  >
                    +
                  </Button>
                </div>
                <svg
                  ref={svgRef}
                  viewBox={viewBoxString}
                  className="absolute inset-0 w-full h-full"
                  suppressHydrationWarning
                  onClick={(e) => {
                    // Reset to "All themes" when clicking outside clusters
                    // Only if the target is the SVG element itself (background)
                    if (e.target === e.currentTarget) {
                      setSelectedTheme("all");
                    }
                  }}
                >
                  {/* Faint axes intersecting at center */}
                  <g opacity={zoomConfig.axisOpacity}>
                    {/* Vertical axis (Y) */}
                    <line
                      x1={CANVAS_SIZE / 2}
                      y1={0}
                      x2={CANVAS_SIZE / 2}
                      y2={CANVAS_SIZE}
                      stroke="#94a3b8"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                    {/* Horizontal axis (X) */}
                    <line
                      x1={0}
                      y1={CANVAS_SIZE / 2}
                      x2={CANVAS_SIZE}
                      y2={CANVAS_SIZE / 2}
                      stroke="#94a3b8"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                  </g>

                  {/* Render dots that don't belong to the hovered cluster (below clusters) */}
                  {points
                    .filter((p) => p.clusterIndex !== hoveredCluster)
                    .map((p) => {
                      const active =
                        selectedTheme === "all" ||
                        (selectedTheme === "unclustered" &&
                          p.clusterIndex === null) ||
                        p.clusterIndex === selectedTheme;
                      return (
                        <circle
                          key={p.id}
                          cx={p.sx}
                          cy={p.sy}
                          r={zoomConfig.dotRadius}
                          fill={
                            p.clusterIndex === MISC_CLUSTER_INDEX
                              ? MISC_COLOR
                              : p.clusterIndex !== null
                                ? palette[p.clusterIndex % palette.length]
                                : "#94a3b8"
                          }
                          opacity={active ? 0.9 : 0.15}
                        >
                          <title suppressHydrationWarning>
                            {p.responseText.slice(0, 80)}
                            {p.responseText.length > 80 ? "…" : ""}{" "}
                            {p.tag ? `(${p.tag})` : ""}
                          </title>
                        </circle>
                      );
                    })}

                  {/* Sort clusters so hovered one renders last (on top in SVG) */}
                  {[...clusterMeta]
                    .sort((a, b) => {
                      if (hoveredCluster === a.idx) return 1;
                      if (hoveredCluster === b.idx) return -1;
                      return 0;
                    })
                    .map((meta) => {
                      const active =
                        selectedTheme === "all" || selectedTheme === meta.idx;
                      const hover = hoveredCluster === meta.idx;
                      const borderOpacity = active ? (hover ? 0.6 : 0.3) : 0.2;
                      const fillOpacity = active ? (hover ? 0.12 : 0.08) : 0.05;
                      const strokeWidth = hover
                        ? zoomConfig.clusterStrokeWidth * 2.5
                        : active
                          ? zoomConfig.clusterStrokeWidth
                          : zoomConfig.clusterStrokeWidth * 0.5;

                      // Label dimensions
                      const textWidth = meta.themeName.length * 7;
                      const padding = 12;
                      const rectWidth = textWidth + padding;
                      const rectHeight = 20;

                      // Get dots for this cluster (only rendered for hovered cluster)
                      const clusterDots = hover
                        ? points.filter((p) => p.clusterIndex === meta.idx)
                        : [];

                      return (
                        <g
                          key={meta.idx}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredCluster(meta.idx)}
                          onMouseLeave={() => setHoveredCluster(null)}
                          onClick={() =>
                            setSelectedTheme((prev) =>
                              prev === meta.idx ? "all" : meta.idx
                            )
                          }
                        >
                          {/* Cluster shape */}
                          <path
                            d={meta.hullPath}
                            fill={meta.color}
                            fillOpacity={fillOpacity}
                            stroke={meta.color}
                            strokeOpacity={borderOpacity}
                            strokeWidth={strokeWidth}
                            className="transition-all duration-150"
                          />
                          {/* Dots for hovered cluster (render above shape but below label) */}
                          {clusterDots.map((p) => {
                            const dotActive =
                              selectedTheme === "all" ||
                              p.clusterIndex === selectedTheme;
                            return (
                              <circle
                                key={p.id}
                                cx={p.sx}
                                cy={p.sy}
                                r={zoomConfig.dotRadius}
                                fill={palette[meta.idx % palette.length]}
                                opacity={dotActive ? 0.9 : 0.15}
                              >
                                <title suppressHydrationWarning>
                                  {p.responseText.slice(0, 80)}
                                  {p.responseText.length > 80 ? "…" : ""}{" "}
                                  {p.tag ? `(${p.tag})` : ""}
                                </title>
                              </circle>
                            );
                          })}
                          {/* Cluster label */}
                          <rect
                            x={meta.cx - rectWidth / 2}
                            y={meta.cy - rectHeight / 2}
                            width={rectWidth}
                            height={rectHeight}
                            rx={10}
                            fill="rgba(255,255,255,0.95)"
                            stroke={meta.color}
                            strokeOpacity={0.2}
                            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.08))"
                          />
                          <text
                            x={meta.cx}
                            y={meta.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={meta.color}
                            fontSize="12"
                            fontWeight="500"
                            opacity={active ? 1 : 0.6}
                            pointerEvents="none"
                          >
                            {meta.themeName}
                          </text>
                        </g>
                      );
                    })}
                </svg>
                {filteredPoints.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-body text-slate-500">
                    No points for this theme.
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 bg-slate-100 animate-pulse rounded-xl" />
            )}
          </div>
        </div>

        {/* Right column: Response list - maintains readable width */}
        <div className="bg-white space-y-4 p-4 md:p-6 lg:p-8 rounded-2xl shadow-sm border border-slate-100 md:h-full md:overflow-y-auto">
          {/* Skeleton loading for loading_results state */}
          {showSkeletons && <ClusterListSkeleton count={4} />}
          {/* Analysis in progress indicator for starting/analysing states */}
          {showProgressOverlay && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-700">
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>
                {analysisProgress?.step
                  ? `Step ${analysisProgress.step.current} of ${analysisProgress.step.total}: ${analysisProgress.step.label}`
                  : "Running analysis..."}
              </span>
            </div>
          )}
          {/* Hide content when showing skeletons */}
          {!showSkeletons && (
            <>
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
                    style={{
                      color:
                        selectedTheme === "unclustered"
                          ? "#94a3b8"
                          : getThemeColor(selectedTheme),
                    }}
                  >
                    {selectedThemeLabel}
                  </span>
                </div>
              )}

              <div
                className={
                  selectedTheme === "all" ? "space-y-8" : "space-y-8 pt-4"
                }
              >
                {filteredItems.length === 0 ? (
                  <div className="text-body text-slate-600">
                    No responses yet. Upload on Listen to get started.
                  </div>
                ) : selectedTheme === "all" ? (
                  /* Cluster summary cards for "All themes" view */
                  <div className="space-y-6">
                    {clusterSummaries.map((summary) => {
                      const themeColor =
                        summary.clusterIndex !== null
                          ? getThemeColor(summary.clusterIndex)
                          : "#94a3b8"; // slate for unclustered

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
                          onMouseEnter={() =>
                            setHoveredCluster(summary.clusterIndex)
                          }
                          onMouseLeave={() => setHoveredCluster(null)}
                        >
                          <div className="flex items-center justify-between">
                            <div
                              className="text-label uppercase tracking-[0.04em]"
                              style={{ color: themeColor }}
                            >
                              {summary.title}
                            </div>
                            <span className="text-xs text-slate-400 underline group-hover:text-slate-600 transition-colors">
                              Show {summary.responseCount} response
                              {summary.responseCount !== 1 ? "s" : ""}
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
                  </div>
                ) : (
                  /* Regular response list for filtered views */
                  <>
                    {/* Render cluster buckets (LLM-driven consolidation) */}
                    {filteredBuckets.map((bucket) => (
                      <ClusterBucketCard
                        key={bucket.bucketId}
                        bucket={bucket}
                        conversationId={conversationId}
                        themeColor={getThemeColor(bucket.clusterIndex)}
                        onVote={vote}
                        conversationType={conversationType}
                        feedbackById={feedbackById}
                      />
                    ))}

                    {/* Render ungrouped/unconsolidated responses */}
                    {ungroupedItems.map((resp) => (
                      <div key={resp.id} className="rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 text-label rounded-full border ${
                              resp.tag
                                ? getTagColors(resp.tag)
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {resp.tag ?? "response"}
                          </span>
                          <span className="text-info text-slate-500">
                            {resp.counts.agree} agree · {resp.counts.pass} pass
                            · {resp.counts.disagree} disagree
                          </span>
                        </div>

                        <p className="text-body text-slate-800 leading-relaxed line-clamp-3">
                          {resp.responseText}
                        </p>

                        {conversationType === "understand" && (
                          <div className="flex gap-2">
                            {(["agree", "pass", "disagree"] as Feedback[]).map(
                              (fb) => {
                                const active = resp.current === fb;
                                const hasVoted = resp.current !== null;
                                const isDisabled = hasVoted && !active;

                                const activeStyles =
                                  fb === "agree"
                                    ? "!bg-emerald-100 !text-emerald-800 !border-emerald-300 hover:!bg-emerald-100"
                                    : fb === "disagree"
                                      ? "!bg-orange-100 !text-orange-800 !border-orange-300 hover:!bg-orange-100"
                                      : "!bg-slate-200 !text-slate-800 !border-slate-300 hover:!bg-slate-200";
                                const inactiveStyles =
                                  "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50";
                                const disabledStyles =
                                  "!bg-slate-100 !text-slate-400 !border-slate-200 !cursor-not-allowed";

                                return (
                                  <Button
                                    key={fb}
                                    variant="secondary"
                                    size="sm"
                                    disabled={isDisabled}
                                    onClick={() => vote(resp.id, fb)}
                                    className={`flex-1 transition-colors ${
                                      active
                                        ? activeStyles
                                        : isDisabled
                                          ? disabledStyles
                                          : inactiveStyles
                                    }`}
                                  >
                                    {fb === "agree" && "Agree"}
                                    {fb === "pass" && "Pass"}
                                    {fb === "disagree" && "Disagree"}
                                  </Button>
                                );
                              }
                            )}
                          </div>
                        )}

                        {conversationType === "decide" && (
                          <p className="text-info text-slate-500 italic mt-1">
                            Feedback disabled for decision sessions
                          </p>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
