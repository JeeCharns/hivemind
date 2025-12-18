"use client";

/**
 * UnderstandView - Understand Tab Client Component
 *
 * Left: Interactive theme map with UMAP points and cluster rings
 * Right: Response list with feedback buttons (agree/pass/disagree)
 * Follows SRP: UI only, business logic in useConversationFeedback hook
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { UnderstandViewModel, ResponsePoint } from "@/types/conversation-understand";
import { useConversationFeedback } from "@/lib/conversations/react/useConversationFeedback";
import { getTagColors } from "@/lib/conversations/domain/tags";
import Button from "@/app/components/button";
import type { Feedback } from "@/types/conversation-understand";

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

const CANVAS_SIZE = 520;
const PAN_PADDING = 120;

/**
 * Scale UMAP points to canvas coordinates
 */
const scalePoints = (points: ResponsePoint[], size = CANVAS_SIZE) => {
  // Filter out points without coordinates
  const validPoints = points.filter((p) => p.xUmap !== null && p.yUmap !== null);

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

export default function UnderstandView({ viewModel, conversationType = "understand" }: UnderstandViewProps) {
  const { conversationId, responses, themes, feedbackItems } = viewModel;

  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [hoveredCluster, setHoveredCluster] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const { items, vote, loadingId } = useConversationFeedback({
    conversationId,
    initialItems: feedbackItems,
  });

  const points = useMemo(() => scalePoints(responses), [responses]);

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
    return Object.entries(clusters).map(([idx, { pts }]) => {
      const xs = pts.map((p) => p.sx!);
      const ys = pts.map((p) => p.sy!);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const maxRadius = Math.max(
        ...pts.map((p) => Math.hypot(p.sx! - cx, p.sy! - cy))
      );
      const radius = maxRadius + 18;
      const color = palette[Number(idx) % palette.length];
      const themeName =
        themes.find((t) => t.clusterIndex === Number(idx))?.name ??
        `Theme ${idx}`;
      return {
        idx: Number(idx),
        cx,
        cy,
        radius,
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

  const onPanStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
    dragStart.current = { x: event.clientX, y: event.clientY };
    panStart.current = pan;
  };

  const onPanMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
  };

  const onPanEnd = () => {
    setDragging(false);
  };

  const panStyle = { transform: `translate(${pan.x}px, ${pan.y}px)` };

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  return (
    <div className="flex flex-col gap-6 pt-6 h-[calc(100vh-180px)] overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start flex-1 overflow-hidden">
        {/* Left column: Theme map */}
        <div className="bg-white rounded-2xl overflow-hidden lg:col-span-2">
          <div
            className={`relative bg-slate-50 rounded-xl h-full overflow-hidden ${
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
                <svg
                  viewBox={`-${PAN_PADDING} -${PAN_PADDING} ${
                    CANVAS_SIZE + PAN_PADDING * 2
                  } ${CANVAS_SIZE + PAN_PADDING * 2}`}
                  className="w-full h-full"
                  style={panStyle}
                  suppressHydrationWarning
                >
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
                        <circle
                          cx={meta.cx}
                          cy={meta.cy}
                          r={meta.radius}
                          fill={meta.color}
                          fillOpacity={fillOpacity}
                          stroke={meta.color}
                          strokeOpacity={borderOpacity}
                          strokeWidth={active ? 2 : 1}
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
                        r={6}
                        fill={
                          p.clusterIndex !== null
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
                </svg>
                {filteredPoints.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                    No points for this theme.
                  </div>
                )}
                <div
                  className="pointer-events-none absolute"
                  style={{
                    zIndex: 10,
                    ...panStyle,
                    left: -PAN_PADDING,
                    top: -PAN_PADDING,
                    width: CANVAS_SIZE + PAN_PADDING * 2,
                    height: CANVAS_SIZE + PAN_PADDING * 2,
                  }}
                >
                  {clusterMeta.map((meta) => {
                    const active =
                      selectedCluster === null || selectedCluster === meta.idx;
                    return (
                      <div
                        key={meta.idx}
                        style={{
                          position: "absolute",
                          left: meta.cx + PAN_PADDING,
                          top: meta.cy + PAN_PADDING,
                          transform: "translate(-50%, -50%)",
                          background: "rgba(255,255,255,0.95)",
                          border: `1px solid ${meta.color}33`,
                          borderRadius: "9999px",
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          textAlign: "center",
                          width: "max-content",
                          color: meta.color,
                          boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
                          pointerEvents: "none",
                          opacity: active ? 1 : 0.6,
                        }}
                      >
                        {meta.themeName}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="absolute inset-0 bg-slate-100 animate-pulse rounded-xl" />
            )}
          </div>
        </div>

        {/* Right column: Response list */}
        <div className="bg-white space-y-4 p-8 rounded-2xl h-full overflow-y-auto lg:col-span-3">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedCluster(null)}
                className={`px-3 ${
                  selectedCluster === null
                    ? "border-indigo-200 bg-indigo-50"
                    : "border-slate-200 hover:border-indigo-200"
                }`}
              >
                All themes
              </Button>
              {themes.map((theme) => (
                <Button
                  key={theme.clusterIndex}
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setSelectedCluster(
                      selectedCluster === theme.clusterIndex
                        ? null
                        : theme.clusterIndex
                    )
                  }
                  className={`px-3 ${
                    selectedCluster === theme.clusterIndex
                      ? "border-indigo-200 bg-indigo-50"
                      : "border-slate-200 hover:border-indigo-200"
                  }`}
                >
                  {theme.name || `Theme ${theme.clusterIndex}`}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-8 pt-4">
            {filteredItems.length === 0 ? (
              <div className="text-slate-600">
                No responses yet. Upload on Listen to get started.
              </div>
            ) : (
              filteredItems.map((resp) => (
                <div key={resp.id} className="rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${
                        resp.tag
                          ? getTagColors(resp.tag)
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {resp.tag ?? "response"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {resp.counts.agree} agree · {resp.counts.pass} pass ·{" "}
                      {resp.counts.disagree} disagree
                    </span>
                  </div>

                  <p className="text-slate-800 leading-relaxed line-clamp-3">
                    {resp.responseText}
                  </p>

                  {conversationType === "understand" && (
                    <div className="flex gap-2">
                      {(["agree", "pass", "disagree"] as Feedback[]).map((fb) => {
                        const active = resp.current === fb;
                        const base =
                          fb === "agree"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : fb === "disagree"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-slate-50 text-slate-700 border-slate-200";
                        return (
                          <Button
                            key={fb}
                            variant="secondary"
                            size="sm"
                            disabled={loadingId === resp.id}
                            onClick={() => vote(resp.id, fb)}
                            className={`flex-1 ${
                              active
                                ? base
                                : "bg-white text-slate-700 border-slate-200 hover:border-indigo-200"
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
                    <p className="text-xs text-slate-500 italic mt-1">
                      Feedback disabled for decision sessions
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
