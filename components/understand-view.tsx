"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ResponsePoint = {
  id: number;
  response_text: string;
  tag: string | null;
  cluster_index: number;
  x_umap: number;
  y_umap: number;
};

type Feedback = "agree" | "pass" | "disagree";

type FeedbackItem = {
  id: number;
  response_text: string;
  tag: string | null;
  cluster_index: number | null;
  counts: Record<Feedback, number>;
  current: Feedback | null;
};

type ThemeRow = {
  cluster_index: number;
  name: string | null;
  description: string | null;
  size: number | null;
};

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

const tagColors: Record<string, string> = {
  data: "bg-blue-50 text-blue-700 border-blue-100",
  problem: "bg-red-50 text-red-700 border-red-100",
  need: "bg-amber-50 text-amber-700 border-amber-100",
  want: "bg-emerald-50 text-emerald-700 border-emerald-100",
  risk: "bg-orange-50 text-orange-700 border-orange-100",
  proposal: "bg-indigo-50 text-indigo-700 border-indigo-100",
};

const CANVAS_SIZE = 520;
const PAN_PADDING = 120;

const scalePoints = (points: ResponsePoint[], size = CANVAS_SIZE) => {
  const xs = points.map((p) => p.x_umap);
  const ys = points.map((p) => p.y_umap);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 0;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  return points.map((p) => ({
    ...p,
    sx: ((p.x_umap - minX) / rangeX) * (size - pad * 2) + pad,
    sy: ((p.y_umap - minY) / rangeY) * (size - pad * 2) + pad,
  }));
};

export default function UnderstandView({
  responses,
  themes,
  feedbackItems,
  conversationId,
}: {
  responses: ResponsePoint[];
  themes: ThemeRow[];
  feedbackItems: FeedbackItem[];
  conversationId: string;
}) {
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [hoveredCluster, setHoveredCluster] = useState<number | null>(null);
  const [items, setItems] = useState<FeedbackItem[]>(feedbackItems);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const originalItems = useRef<Record<number, FeedbackItem>>(
    feedbackItems.reduce(
      (acc, item) => ({ ...acc, [item.id]: item }),
      {} as Record<number, FeedbackItem>
    )
  );
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const points = useMemo(() => scalePoints(responses), [responses]);

  const clusters = useMemo(() => {
    const grouped: Record<
      number,
      { pts: ReturnType<typeof scalePoints>[number][] }
    > = {};
    points.forEach((p) => {
      if (!grouped[p.cluster_index]) grouped[p.cluster_index] = { pts: [] };
      grouped[p.cluster_index].pts.push(p);
    });
    return grouped;
  }, [points]);

  const clusterMeta = useMemo(() => {
    return Object.entries(clusters).map(([idx, { pts }]) => {
      const xs = pts.map((p) => p.sx);
      const ys = pts.map((p) => p.sy);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const maxRadius = Math.max(
        ...pts.map((p) => Math.hypot(p.sx - cx, p.sy - cy))
      );
      const radius = maxRadius + 18;
      const color = palette[Number(idx) % palette.length];
      const themeName =
        themes.find((t) => t.cluster_index === Number(idx))?.name ??
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
      : points.filter((p) => p.cluster_index === selectedCluster);

  const filteredItems =
    selectedCluster === null
      ? items
      : items.filter((r) => r.cluster_index === selectedCluster);

  const selectedTheme = themes.find((t) => t.cluster_index === selectedCluster);

  const updateFeedback = async (responseId: number, feedback: Feedback) => {
    setLoadingId(responseId);
    setItems((prev) =>
      prev.map((r) => {
        if (r.id !== responseId) return r;
        const prevChoice = r.current;
        const nextCounts = { ...r.counts };
        if (prevChoice)
          nextCounts[prevChoice] = Math.max(0, nextCounts[prevChoice] - 1);
        nextCounts[feedback] = (nextCounts[feedback] ?? 0) + 1;
        return { ...r, counts: nextCounts, current: feedback };
      })
    );

    const res = await fetch(`/api/conversations/${conversationId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseId, feedback }),
    });

    if (!res.ok) {
      setItems((prev) =>
        prev.map((r) =>
          r.id === responseId ? originalItems.current[responseId] ?? r : r
        )
      );
      setLoadingId(null);
      return;
    }

    const body = await res.json().catch(() => null);
    if (body?.counts) {
      setItems((prev) =>
        prev.map((r) =>
          r.id === responseId
            ? {
                ...r,
                counts: body.counts,
                current: feedback,
              }
            : r
        )
      );
    }
    setLoadingId(null);
  };

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
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col gap-6 pt-6 h-[calc(100vh-180px)] overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start flex-1 overflow-hidden">
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
                  viewBox={`-${PAN_PADDING} -${PAN_PADDING} ${CANVAS_SIZE + PAN_PADDING * 2} ${CANVAS_SIZE + PAN_PADDING * 2}`}
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
                      p.cluster_index === selectedCluster;
                    return (
                      <circle
                        key={p.id}
                        cx={p.sx}
                        cy={p.sy}
                        r={6}
                        fill={palette[p.cluster_index % palette.length]}
                        opacity={active ? 0.9 : 0.15}
                      >
                        <title suppressHydrationWarning>
                          {p.response_text.slice(0, 80)}
                          {p.response_text.length > 80 ? "…" : ""}{" "}
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

        <div className="bg-white space-y-4 p-8 rounded-2xl h-full overflow-y-auto lg:col-span-3">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCluster(null)}
                className={`px-2 py-1 rounded-lg border text-sm font-medium transition ${
                  selectedCluster === null
                    ? "border-indigo-200 bg-indigo-50"
                    : "border-slate-200 hover:border-indigo-200"
                }`}
              >
                All themes
              </button>
              {themes.map((theme) => (
                <button
                  key={theme.cluster_index}
                  onClick={() =>
                    setSelectedCluster(
                      selectedCluster === theme.cluster_index
                        ? null
                        : theme.cluster_index
                    )
                  }
                  className={`px-2 py-1 rounded-lg border text-sm font-medium transition ${
                    selectedCluster === theme.cluster_index
                      ? "border-indigo-200 bg-indigo-50"
                      : "border-slate-200 hover:border-indigo-200"
                  }`}
                >
                  {theme.name || `Theme ${theme.cluster_index}`}
                </button>
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
                <div key={resp.id} className=" rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${
                        resp.tag && tagColors[resp.tag]
                          ? tagColors[resp.tag]
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
                    {resp.response_text}
                  </p>

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
                        <button
                          key={fb}
                          disabled={loadingId === resp.id}
                          onClick={() => updateFeedback(resp.id, fb)}
                          className={`flex-1 px-3 py-2 text-sm font-medium border rounded-lg transition ${
                            active
                              ? base
                              : "bg-white text-slate-700 border-slate-200 hover:border-indigo-200"
                          } disabled:opacity-50`}
                        >
                          {fb === "agree" && "Agree"}
                          {fb === "pass" && "Pass"}
                          {fb === "disagree" && "Disagree"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
