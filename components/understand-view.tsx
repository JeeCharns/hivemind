"use client";

import { useMemo, useState } from "react";

type ResponsePoint = {
  id: number;
  response_text: string;
  tag: string | null;
  cluster_index: number;
  x_umap: number;
  y_umap: number;
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

const scalePoints = (points: ResponsePoint[], size = 480) => {
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
}: {
  responses: ResponsePoint[];
  themes: ThemeRow[];
}) {
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [hoveredCluster, setHoveredCluster] = useState<number | null>(null);

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

  const filtered =
    selectedCluster === null
      ? points
      : points.filter((p) => p.cluster_index === selectedCluster);

  const selectedTheme = themes.find((t) => t.cluster_index === selectedCluster);

  return (
    <div className="space-y-6">
      <div className=" bg-white rounded-2xl p-0">
        <div className="relative bg-slate-50 rounded-xl h-[520px] overflow-hidden">
          <svg viewBox="0 0 520 520" className="w-full h-full">
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
                selectedCluster === null || p.cluster_index === selectedCluster;
              return (
                <circle
                  key={p.id}
                  cx={p.sx}
                  cy={p.sy}
                  r={6}
                  fill={palette[p.cluster_index % palette.length]}
                  opacity={active ? 0.9 : 0.15}
                >
                  <title>
                    {p.response_text.slice(0, 80)}
                    {p.response_text.length > 80 ? "…" : ""}{" "}
                    {p.tag ? `(${p.tag})` : ""}
                  </title>
                </circle>
              );
            })}
          </svg>
          {filtered.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              No points for this theme.
            </div>
          )}
          {/* Labels overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ zIndex: 10 }}
          >
            {clusterMeta.map((meta) => {
              const clamp = (val: number, min: number, max: number) =>
                Math.min(Math.max(val, min), max);
              const x = clamp(meta.cx, 8, 512);
              const y = clamp(meta.cy, 8, 512);
              const active =
                selectedCluster === null || selectedCluster === meta.idx;
              return (
                <div
                  key={meta.idx}
                  style={{
                    position: "absolute",
                    left: x,
                    top: y,
                    transform: "translate(-20%, -0%)",
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
        </div>
      </div>

      {selectedCluster !== null && (
        <div className="bg-white  rounded-2xl p-8 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-900">
                {selectedTheme?.name || `Theme ${selectedCluster}`}
              </h3>
              <p className="text-sm text-slate-600">
                {selectedTheme?.description || "No description provided."}
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {selectedTheme?.size ?? 0} responses
            </span>
          </div>
          <div className="space-y-2">
            {responses
              .filter((r) => r.cluster_index === selectedCluster)
              .map((r) => (
                <div
                  key={r.id}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
                >
                  {r.response_text}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
