"use client";

/**
 * ClusterListSkeleton - Placeholder for cluster list during loading
 *
 * Shows shimmer cards matching ClusterBucketCard dimensions while data loads.
 * Used in the right panel during LOADING_RESULTS state.
 */

function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="bg-white border-l-2 border-slate-200 pl-3 space-y-3 animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Theme title placeholder */}
      <div className="h-4 w-32 bg-slate-200 rounded" />

      {/* Consolidated statement placeholder */}
      <div className="space-y-2">
        <div className="h-3 w-full bg-slate-100 rounded" />
        <div className="h-3 w-4/5 bg-slate-100 rounded" />
      </div>

      {/* Response count placeholder */}
      <div className="h-3 w-24 bg-slate-100 rounded" />
    </div>
  );
}

export interface ClusterListSkeletonProps {
  /** Number of skeleton cards to show */
  count?: number;
}

export default function ClusterListSkeleton({
  count = 4,
}: ClusterListSkeletonProps) {
  return (
    <div className="space-y-6">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} delay={i * 100} />
      ))}
    </div>
  );
}
