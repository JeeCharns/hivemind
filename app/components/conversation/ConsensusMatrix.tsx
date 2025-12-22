"use client";

import { useMemo, useState } from "react";
import type { ConsensusItem } from "@/types/conversation-report";

type SortMode = "agreement" | "divisive";

type ConsensusMatrixProps = {
  items: ConsensusItem[];
  totalInteractions: number;
  title?: string;
  initialVisible?: number;
  pageSize?: number;
};

type ChartRow = ConsensusItem & {
  label: string;
  score: number;
};

function truncateLabel(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function barColor(score: number): string {
  if (score > 75) return "bg-emerald-500";
  if (score > 50) return "bg-amber-500";
  return "bg-red-500";
}

export default function ConsensusMatrix({
  items,
  totalInteractions,
  title = "Consensus Matrix",
  initialVisible = 12,
  pageSize = 12,
}: ConsensusMatrixProps) {
  const [sortMode, setSortMode] = useState<SortMode>("agreement");

  const itemsKey = useMemo(() => {
    if (items.length === 0) return "empty";
    return items.map((item) => item.id).join("|");
  }, [items]);

  return (
    <ConsensusMatrixContent
      key={`${initialVisible}-${itemsKey}`}
      items={items}
      totalInteractions={totalInteractions}
      title={title}
      initialVisible={initialVisible}
      pageSize={pageSize}
      sortMode={sortMode}
      onSortModeChange={setSortMode}
    />
  );
}

type ConsensusMatrixContentProps = {
  items: ConsensusItem[];
  totalInteractions: number;
  title: string;
  initialVisible: number;
  pageSize: number;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
};

function ConsensusMatrixContent({
  items,
  totalInteractions,
  title,
  initialVisible,
  pageSize,
  sortMode,
  onSortModeChange,
}: ConsensusMatrixContentProps) {
  const [visibleCount, setVisibleCount] = useState(initialVisible);

  const sortedRows: ChartRow[] = useMemo(() => {
    const rows = items
      .map((item) => {
        const score = Math.max(0, Math.min(100, item.agreePercent));
        return {
          ...item,
          score,
          label: truncateLabel(item.responseText, 40) || "Untitled",
        };
      });

    return rows
      .slice()
      .sort((a, b) => {
        if (sortMode === "divisive") {
          const aDivisive = Math.min(a.agreePercent, a.disagreePercent);
          const bDivisive = Math.min(b.agreePercent, b.disagreePercent);
          if (bDivisive !== aDivisive) return bDivisive - aDivisive;
          if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes;
          return a.id.localeCompare(b.id);
        }

        // Most agreed-upon first; within same %, most votes first.
        if (b.score !== a.score) return b.score - a.score;
        if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes;
        return a.id.localeCompare(b.id);
      })
      .slice();
  }, [items, sortMode]);

  const chartData = useMemo(() => {
    return sortedRows.slice(0, visibleCount);
  }, [sortedRows, visibleCount]);

  const averageConsensus = useMemo(() => {
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, curr) => {
      const consensus = Math.max(curr.agreePercent, curr.disagreePercent);
      return acc + consensus;
    }, 0);
    return Math.round(sum / items.length);
  }, [items]);

  return (
    <div className="flex-1 flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm transition-colors">
          <div className="text-display-sm md:text-display-md text-slate-900 mb-1 tabular-nums">
            {averageConsensus}%
          </div>
          <div className="text-slate-500 text-label md:text-body">
            Average Consensus
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm transition-colors">
          <div className="text-display-sm md:text-display-md text-slate-900 mb-1 tabular-nums">
            {totalInteractions}
          </div>
          <div className="text-slate-500 text-label md:text-body">
            Total Interactions
          </div>
        </div>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm transition-colors">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h3 className="text-h4 text-slate-900">
            {title}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onSortModeChange("agreement");
                setVisibleCount(initialVisible);
              }}
              className={`h-8 px-3 rounded-md border text-button transition ${
                sortMode === "agreement"
                  ? "bg-[#EDEFFD] text-brand-primary border-[#D7DBFF]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Most agreed
            </button>
            <button
              type="button"
              onClick={() => {
                onSortModeChange("divisive");
                setVisibleCount(initialVisible);
              }}
              className={`h-8 px-3 rounded-md border text-button transition ${
                sortMode === "divisive"
                  ? "bg-[#EDEFFD] text-brand-primary border-[#D7DBFF]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Most divisive
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {chartData.map((row) => (
            <div
              key={row.id}
              className="relative flex items-center gap-3 group"
            >
              <div
                className="w-[120px] text-pill text-slate-500"
              >
                {row.label}
              </div>

              <div className="flex-1">
                <div
                  className="relative h-5 rounded-md bg-slate-100 overflow-hidden"
                >
                  <div
                    className={`h-full ${barColor(row.score)}`}
                    style={{ width: `${row.score}%` }}
                  />
                  <div className="absolute left-[75%] top-0 bottom-0 w-px border-l border-dashed border-emerald-400/70 pointer-events-none" />
                </div>
              </div>

              <div className="w-10 text-pill text-slate-400 text-right tabular-nums">
                {row.score}%
              </div>

              <div className="hidden group-hover:block absolute z-20 left-[130px] right-0 bottom-full mb-2">
                <div className="max-w-xl rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
                  <div className="text-subtitle text-slate-900">
                    {row.responseText}
                  </div>
                  <div className="mt-1 text-info text-slate-500">
                    {row.totalVotes} votes
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-label tabular-nums">
                    <span className="text-emerald-700">
                      {row.agreePercent}% agree
                    </span>
                    <span className="text-slate-600">
                      {row.passPercent}% pass
                    </span>
                    <span className="text-red-700">
                      {row.disagreePercent}% disagree
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-between text-pill md:text-label text-slate-400 uppercase tracking-widest px-2 md:px-10">
          <span>Controversial</span>
          <span>Mixed</span>
          <span>Strong Consensus</span>
        </div>

        {sortedRows.length > visibleCount ? (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md transition border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 h-9 px-4 text-button"
              onClick={() => setVisibleCount((n) => n + pageSize)}
            >
              Show more
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
