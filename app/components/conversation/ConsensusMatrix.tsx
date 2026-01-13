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

// Segment colors for the stacked bar
const SEGMENT_COLORS = {
  agree: "bg-emerald-500",
  pass: "bg-slate-400",
  disagree: "bg-orange-500",
  notVoted: "bg-slate-200",
};

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
          label: item.responseText || "Untitled",
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

  // Use the response with the most votes as a proxy for total participants
  const maxVotes = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.max(...items.map((item) => item.totalVotes));
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
              className="relative flex items-start gap-3 group"
            >
              <div
                className="w-[45%] shrink-0 text-pill text-text-secondary line-clamp-3"
              >
                {row.label}
              </div>

              <div className="flex-1 min-w-0 mt-0.5">
                {(() => {
                  // Calculate percentages relative to maxVotes (proxy for total participants)
                  const scale = maxVotes > 0 ? 100 / maxVotes : 0;
                  const agreeWidth = row.agreeVotes * scale;
                  const passWidth = row.passVotes * scale;
                  const disagreeWidth = row.disagreeVotes * scale;
                  const notVotedWidth = 100 - agreeWidth - passWidth - disagreeWidth;

                  return (
                    <div className="relative h-5 rounded-md overflow-hidden flex">
                      {/* Agree segment */}
                      {agreeWidth > 0 && (
                        <div
                          className={`h-full ${SEGMENT_COLORS.agree}`}
                          style={{ width: `${agreeWidth}%` }}
                        />
                      )}
                      {/* Pass segment */}
                      {passWidth > 0 && (
                        <div
                          className={`h-full ${SEGMENT_COLORS.pass}`}
                          style={{ width: `${passWidth}%` }}
                        />
                      )}
                      {/* Disagree segment */}
                      {disagreeWidth > 0 && (
                        <div
                          className={`h-full ${SEGMENT_COLORS.disagree}`}
                          style={{ width: `${disagreeWidth}%` }}
                        />
                      )}
                      {/* Not voted segment */}
                      {notVotedWidth > 0 && (
                        <div
                          className={`h-full ${SEGMENT_COLORS.notVoted}`}
                          style={{ width: `${notVotedWidth}%` }}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="w-10 text-pill text-slate-400 text-right tabular-nums mt-0.5">
                {row.score}%
              </div>

              <div className="hidden group-hover:block absolute z-20 left-[46%] right-0 bottom-full mb-2">
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

        <div className="mt-6 flex flex-wrap justify-center gap-4 text-pill md:text-label text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${SEGMENT_COLORS.agree}`} />
            <span>Agree</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${SEGMENT_COLORS.pass}`} />
            <span>Pass</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${SEGMENT_COLORS.disagree}`} />
            <span>Disagree</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${SEGMENT_COLORS.notVoted}`} />
            <span>Not voted</span>
          </div>
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
