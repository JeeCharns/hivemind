"use client";

/**
 * ClusterMapSkeleton - Placeholder for cluster map during loading
 *
 * Shows grey blob shapes suggesting cluster layout while data loads.
 * Matches the dimensions of the actual cluster map area.
 */

export default function ClusterMapSkeleton() {
  return (
    <div className="relative w-full h-full bg-slate-50 rounded-xl overflow-hidden">
      {/* Subtle pulse overlay */}
      <div className="absolute inset-0 bg-white/20 animate-pulse" />

      {/* SVG placeholder clusters */}
      <svg
        viewBox="0 0 520 520"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Faint axes */}
        <g opacity={0.1}>
          <line
            x1={260}
            y1={0}
            x2={260}
            y2={520}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <line
            x1={0}
            y1={260}
            x2={520}
            y2={260}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        </g>

        {/* Cluster placeholder blobs */}
        {/* Top-left cluster */}
        <ellipse
          cx={150}
          cy={140}
          rx={70}
          ry={50}
          fill="#e2e8f0"
          className="animate-pulse"
        />
        {/* Top-right cluster */}
        <ellipse
          cx={380}
          cy={120}
          rx={60}
          ry={45}
          fill="#e2e8f0"
          className="animate-pulse"
          style={{ animationDelay: "150ms" }}
        />
        {/* Center cluster */}
        <ellipse
          cx={280}
          cy={280}
          rx={80}
          ry={60}
          fill="#e2e8f0"
          className="animate-pulse"
          style={{ animationDelay: "300ms" }}
        />
        {/* Bottom-left cluster */}
        <ellipse
          cx={120}
          cy={380}
          rx={55}
          ry={40}
          fill="#e2e8f0"
          className="animate-pulse"
          style={{ animationDelay: "450ms" }}
        />
        {/* Bottom-right cluster */}
        <ellipse
          cx={400}
          cy={400}
          rx={65}
          ry={50}
          fill="#e2e8f0"
          className="animate-pulse"
          style={{ animationDelay: "600ms" }}
        />

        {/* Scatter dots within clusters for texture */}
        {[
          // Top-left cluster dots
          { cx: 130, cy: 130, delay: 0 },
          { cx: 160, cy: 145, delay: 50 },
          { cx: 145, cy: 155, delay: 100 },
          { cx: 170, cy: 125, delay: 150 },
          // Top-right cluster dots
          { cx: 365, cy: 115, delay: 200 },
          { cx: 390, cy: 130, delay: 250 },
          { cx: 375, cy: 140, delay: 300 },
          // Center cluster dots
          { cx: 260, cy: 270, delay: 350 },
          { cx: 290, cy: 285, delay: 400 },
          { cx: 275, cy: 295, delay: 450 },
          { cx: 300, cy: 265, delay: 500 },
          { cx: 255, cy: 290, delay: 550 },
          // Bottom-left cluster dots
          { cx: 110, cy: 375, delay: 600 },
          { cx: 130, cy: 390, delay: 650 },
          { cx: 125, cy: 365, delay: 700 },
          // Bottom-right cluster dots
          { cx: 385, cy: 395, delay: 750 },
          { cx: 410, cy: 410, delay: 800 },
          { cx: 395, cy: 385, delay: 850 },
          { cx: 420, cy: 400, delay: 900 },
        ].map((dot, i) => (
          <circle
            key={i}
            cx={dot.cx}
            cy={dot.cy}
            r={4}
            fill="#cbd5e1"
            className="animate-pulse"
            style={{ animationDelay: `${dot.delay}ms` }}
          />
        ))}
      </svg>
    </div>
  );
}
