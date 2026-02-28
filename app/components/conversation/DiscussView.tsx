"use client";

/**
 * DiscussView - Client Component
 *
 * Main view component for the Discuss tab showing clustered statements
 * Two states:
 * - Cluster overview: clusters with statement title pills
 * - Drilled-in view: back button, cluster name, statements with voting
 */

import { useMemo, useState } from "react";
import type {
  DeliberateViewModel,
  VoteValue,
  DeliberateStatement,
} from "@/types/deliberate-space";
import StatementDetailPanel from "./StatementDetailPanel";
import VoteSlider from "./VoteSlider";
import { Chats, CaretLeft } from "@phosphor-icons/react";
import Button from "@/app/components/button";

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

/** Generate a short title from statement text (first ~5 words) */
function getStatementTitle(text: string): string {
  const words = text.split(/\s+/).slice(0, 5);
  const title = words.join(" ");
  return title.length < text.length ? `${title}...` : title;
}

interface DiscussViewProps {
  viewModel: DeliberateViewModel;
  selectedStatementId: string | null;
  onSelectStatement: (id: string | null) => void;
  onVote: (statementId: string, voteValue: VoteValue | null) => void;
}

export default function DiscussView({
  viewModel,
  selectedStatementId,
  onSelectStatement,
  onVote,
}: DiscussViewProps) {
  const { statements, userVotes, clusters } = viewModel;
  const [selectedClusterIndex, setSelectedClusterIndex] = useState<
    number | null
  >(null);

  const selectedStatement = useMemo(
    () => statements.find((s) => s.id === selectedStatementId) ?? null,
    [statements, selectedStatementId]
  );

  const statementsByCluster = useMemo(() => {
    const grouped = new Map<number | null, DeliberateStatement[]>();
    for (const stmt of statements) {
      const key = stmt.clusterIndex;
      const existing = grouped.get(key) || [];
      existing.push(stmt);
      grouped.set(key, existing);
    }
    return grouped;
  }, [statements]);

  const getClusterColor = (index: number | null) => {
    if (index === null) return "#94a3b8"; // slate-400 for unclustered
    return palette[index % palette.length];
  };

  const handleClusterClick = (clusterIndex: number | null) => {
    setSelectedClusterIndex(clusterIndex);
    // Auto-select first statement in cluster
    const clusterStatements = statementsByCluster.get(clusterIndex) || [];
    if (clusterStatements.length > 0) {
      onSelectStatement(clusterStatements[0].id);
    }
  };

  const handleBackToOverview = () => {
    setSelectedClusterIndex(null);
    onSelectStatement(null);
  };

  const selectedCluster = clusters.find((c) => c.index === selectedClusterIndex);
  const selectedClusterStatements =
    selectedClusterIndex !== null
      ? statementsByCluster.get(selectedClusterIndex) || []
      : [];

  return (
    <div className="flex gap-6 h-full min-h-[600px] p-4">
      {/* Left Column - Cluster List or Drilled-in View */}
      <div className="w-2/5 bg-white rounded-2xl overflow-y-auto p-6">
        {clusters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
            <Chats size={48} className="mb-4" />
            <p>No statements yet</p>
          </div>
        ) : selectedClusterIndex === null ? (
          /* Cluster Overview */
          <div className="space-y-6">
            {clusters.map((cluster) => {
              const clusterStatements =
                statementsByCluster.get(cluster.index) || [];
              const color = getClusterColor(cluster.index);

              return (
                <button
                  key={cluster.index ?? "unclustered"}
                  type="button"
                  className="w-full text-left pl-3 space-y-2 transition-all cursor-pointer group border-l-2 hover:border-l-4"
                  style={{ borderLeftColor: color }}
                  onClick={() => handleClusterClick(cluster.index)}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="text-label uppercase tracking-[0.04em] font-medium"
                      style={{ color }}
                    >
                      {cluster.name || "Unclustered"}
                    </div>
                    <span className="text-xs text-blue-500 underline group-hover:text-blue-600 transition-colors">
                      Show {cluster.statementCount} statement
                      {cluster.statementCount !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Statement title pills */}
                  <div className="flex flex-wrap gap-2">
                    {clusterStatements.map((stmt) => (
                      <span
                        key={stmt.id}
                        className="inline-flex items-center px-3 py-1 text-sm rounded-full bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        {getStatementTitle(stmt.statementText)}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* Drilled-in Cluster View */
          <div className="space-y-6">
            {/* Back button + Cluster name */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="p-2! aspect-square"
                onClick={handleBackToOverview}
                aria-label="Back to all clusters"
              >
                <CaretLeft size={16} weight="bold" />
              </Button>
              <span
                className="font-display text-lg font-medium"
                style={{ color: getClusterColor(selectedClusterIndex) }}
              >
                {selectedCluster?.name || "Unclustered"}
              </span>
            </div>

            {/* Statements in cluster */}
            <div className="space-y-8">
              {selectedClusterStatements.map((stmt) => {
                const color = getClusterColor(stmt.clusterIndex);
                const currentVote = userVotes[stmt.id] ?? null;
                const isSelected = stmt.id === selectedStatementId;

                return (
                  <button
                    key={stmt.id}
                    type="button"
                    className={`w-full text-left space-y-3 p-4 rounded-xl transition-all ${
                      isSelected
                        ? "bg-slate-50 ring-2 ring-slate-200"
                        : "hover:bg-slate-50"
                    }`}
                    onClick={() => onSelectStatement(stmt.id)}
                  >
                    {/* Statement title */}
                    <div
                      className="text-base font-display font-medium"
                      style={{ color }}
                    >
                      {getStatementTitle(stmt.statementText)}
                    </div>

                    {/* Full statement text */}
                    <p className="text-body text-slate-800 leading-relaxed">
                      {stmt.statementText}
                    </p>

                    {/* Inline voting */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="pt-2"
                    >
                      <VoteSlider
                        value={currentVote}
                        onChange={(value) => onVote(stmt.id, value)}
                      />
                    </div>

                    {/* Vote/comment counts */}
                    <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                      <span>{stmt.voteCount} votes</span>
                      <span>{stmt.commentCount} comments</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right Column - Statement Detail */}
      <div className="w-3/5 bg-white rounded-2xl overflow-y-auto">
        {selectedStatement ? (
          <StatementDetailPanel
            statement={selectedStatement}
            currentVote={userVotes[selectedStatement.id] ?? null}
            onVote={(value) => onVote(selectedStatement.id, value)}
            conversationId={viewModel.conversationId}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
            <Chats size={48} className="mb-4" />
            <p>Select a statement to view details and vote</p>
          </div>
        )}
      </div>
    </div>
  );
}
