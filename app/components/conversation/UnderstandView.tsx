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
import { getTagColors } from "@/lib/conversations/domain/tags";
import Button from "@/app/components/button";
import type { Feedback } from "@/types/conversation-understand";
import FrequentlyMentionedGroupCard from "./FrequentlyMentionedGroupCard";
import { MISC_CLUSTER_INDEX } from "@/lib/conversations/domain/thresholds";
import { generateClusterHullPath } from "@/lib/visualization/clusterHull";

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
}

export default function UnderstandView({
  viewModel,
  conversationType = "understand",
}: UnderstandViewProps) {
  const {
    conversationId,
    responses,
    themes,
    feedbackItems,
    frequentlyMentionedGroups: initialGroups,
  } = viewModel;

  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
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
  const [frequentlyMentionedGroups, setFrequentlyMentionedGroups] = useState(
    initialGroups || []
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    items,
    vote: baseVote,
    loadingId,
  } = useConversationFeedback({
    conversationId,
    initialItems: feedbackItems,
  });

  // Wrap vote to also update frequentlyMentionedGroups
  const vote = useCallback(
    async (responseId: string, feedback: Feedback) => {
      // First, do the base vote (handles ungrouped items)
      await baseVote(responseId, feedback);

      // Then, update frequentlyMentionedGroups if the response is a representative
      setFrequentlyMentionedGroups((prevGroups) =>
        prevGroups.map((group) => {
          if (group.representative.id !== responseId) return group;

          // Clone the group and update representative
          const newCounts = { ...group.representative.counts };
          const previousCurrent = group.representative.current;

          // Decrement previous choice if exists
          if (previousCurrent) {
            newCounts[previousCurrent] = Math.max(
              0,
              newCounts[previousCurrent] - 1
            );
          }

          // Increment new choice
          newCounts[feedback] = newCounts[feedback] + 1;

          return {
            ...group,
            representative: {
              ...group.representative,
              counts: newCounts,
              current: feedback,
            },
          };
        })
      );
    },
    [baseVote]
  );

  const points = useMemo(() => scalePoints(responses), [responses]);

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

  const filteredPoints =
    selectedCluster === null
      ? points
      : points.filter((p) => p.clusterIndex === selectedCluster);

  const filteredItems =
    selectedCluster === null
      ? items
      : items.filter((r) => r.clusterIndex === selectedCluster);

  // Filter groups for selected theme
  const filteredGroups = useMemo(() => {
    if (!frequentlyMentionedGroups) return [];
    const groups =
      selectedCluster === null
        ? frequentlyMentionedGroups
        : frequentlyMentionedGroups.filter(
            (g) => g.clusterIndex === selectedCluster
          );

    // When viewing "All themes", prefer showing the most frequently mentioned groups first.
    // Also applies within a single theme for consistency.
    return groups.slice().sort((a, b) => {
      const aSize = a.size ?? a.similarResponses.length + 1;
      const bSize = b.size ?? b.similarResponses.length + 1;
      if (bSize !== aSize) return bSize - aSize;
      if (a.clusterIndex !== b.clusterIndex)
        return a.clusterIndex - b.clusterIndex;
      return a.groupId.localeCompare(b.groupId);
    });
  }, [frequentlyMentionedGroups, selectedCluster]);

  // Create set of grouped response IDs to avoid duplicate rendering
  const groupedResponseIds = useMemo(() => {
    const ids = new Set<string>();
    filteredGroups.forEach((group) => {
      ids.add(group.representative.id);
      group.similarResponses.forEach((resp) => ids.add(resp.id));
    });
    return ids;
  }, [filteredGroups]);

  // Filter out responses that are already in groups
  const ungroupedItems = useMemo(() => {
    return filteredItems.filter((item) => !groupedResponseIds.has(item.id));
  }, [filteredItems, groupedResponseIds]);

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
    if (selectedCluster === null) return "All themes";
    const theme = themes.find((t) => t.clusterIndex === selectedCluster);
    return theme?.name || `Theme ${selectedCluster}`;
  }, [selectedCluster, themes]);

  return (
    <div className="flex flex-col gap-6 pt-6 h-[calc(100vh-180px)] overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start flex-1 overflow-hidden">
        {/* Left column: Theme map */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 h-full">
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
                      setSelectedCluster(null);
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

                  {clusterMeta.map((meta) => {
                    const active =
                      selectedCluster === null || selectedCluster === meta.idx;
                    const hover = hoveredCluster === meta.idx;
                    const borderOpacity = active ? (hover ? 0.4 : 0.3) : 0.2;
                    const fillOpacity = active ? 0.08 : 0.05;
                    return (
                      <g
                        key={meta.idx}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredCluster(meta.idx)}
                        onMouseLeave={() => setHoveredCluster(null)}
                        onClick={() =>
                          setSelectedCluster((prev) =>
                            prev === meta.idx ? null : meta.idx
                          )
                        }
                      >
                        <path
                          d={meta.hullPath}
                          fill={meta.color}
                          fillOpacity={fillOpacity}
                          stroke={meta.color}
                          strokeOpacity={borderOpacity}
                          strokeWidth={
                            active
                              ? zoomConfig.clusterStrokeWidth
                              : zoomConfig.clusterStrokeWidth * 0.5
                          }
                        />
                      </g>
                    );
                  })}
                  {points.map((p) => {
                    const active =
                      selectedCluster === null ||
                      p.clusterIndex === selectedCluster;
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
                  {/* Cluster labels as SVG text */}
                  {clusterMeta.map((meta) => {
                    const active =
                      selectedCluster === null || selectedCluster === meta.idx;
                    // Approximate text width (rough estimation: ~7px per character for 12px font)
                    const textWidth = meta.themeName.length * 7;
                    const padding = 12; // Reduced from 20px
                    const rectWidth = textWidth + padding;
                    const rectHeight = 20;

                    return (
                      <g key={`label-${meta.idx}`}>
                        {/* Background pill */}
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
                        {/* Label text */}
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

        {/* Right column: Response list */}
        <div className="bg-white space-y-4 p-8 rounded-2xl h-full overflow-y-auto shadow-sm border border-slate-100">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-subtitle text-slate-700 whitespace-nowrap">
                Filter by theme:
              </label>
              <div className="relative flex-1" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors text-body"
                >
                  <span className="flex items-center gap-2">
                    {selectedCluster !== null && (
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: getThemeColor(selectedCluster),
                        }}
                      />
                    )}
                    <span className="text-subtitle">{selectedThemeLabel}</span>
                  </span>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {dropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50 max-h-80 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCluster(null);
                        setDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition flex items-center gap-2 text-slate-700"
                    >
                      All themes
                    </button>
                    {themes
                      .sort((a, b) => {
                        // Misc theme always last
                        if (a.clusterIndex === MISC_CLUSTER_INDEX) return 1;
                        if (b.clusterIndex === MISC_CLUSTER_INDEX) return -1;
                        return 0;
                      })
                      .map((theme) => (
                        <button
                          key={theme.clusterIndex}
                          type="button"
                          onClick={() => {
                            setSelectedCluster(theme.clusterIndex);
                            setDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-body hover:bg-slate-50 transition flex items-center gap-2 text-slate-700"
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: getThemeColor(
                                theme.clusterIndex
                              ),
                            }}
                          />
                          {theme.name || `Theme ${theme.clusterIndex}`}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8 pt-4">
            {filteredItems.length === 0 ? (
              <div className="text-body text-slate-600">
                No responses yet. Upload on Listen to get started.
              </div>
            ) : (
              <>
                {/* Render frequently mentioned groups first */}
                {filteredGroups.map((group) => (
                  <FrequentlyMentionedGroupCard
                    key={group.groupId}
                    group={group}
                    onVote={vote}
                    loadingId={loadingId}
                    conversationType={conversationType}
                  />
                ))}

                {/* Render ungrouped responses */}
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
                        {resp.counts.agree} agree · {resp.counts.pass} pass ·{" "}
                        {resp.counts.disagree} disagree
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
                                disabled={loadingId === resp.id}
                                onClick={() => vote(resp.id, fb)}
                                className={`flex-1 transition-colors ${
                                  active ? activeStyles : inactiveStyles
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
        </div>
      </div>
    </div>
  );
}
