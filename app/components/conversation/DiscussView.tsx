"use client";

/**
 * DiscussView - Client Component
 *
 * Main view component for the Discuss tab showing clustered statements
 * Left column: clusters with statement pills (matching understand view pattern)
 * Right column: selected statement detail with voting and comments
 */

import { useMemo, useState } from "react";
import type { DeliberateViewModel, VoteValue } from "@/types/deliberate-space";
import StatementDetailPanel from "./StatementDetailPanel";
import { Chats } from "@phosphor-icons/react";

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
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null);

  const selectedStatement = useMemo(
    () => statements.find((s) => s.id === selectedStatementId) ?? null,
    [statements, selectedStatementId]
  );

  const statementsByCluster = useMemo(() => {
    const grouped = new Map<number | null, typeof statements>();
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
    if (expandedCluster === clusterIndex) {
      setExpandedCluster(null);
    } else {
      setExpandedCluster(clusterIndex);
      // Auto-select first statement in cluster
      const clusterStatements = statementsByCluster.get(clusterIndex) || [];
      if (clusterStatements.length > 0) {
        onSelectStatement(clusterStatements[0].id);
      }
    }
  };

  return (
    <div className="flex gap-6 h-full min-h-[600px] p-4">
      {/* Left Column - Cluster List */}
      <div className="w-2/5 bg-white rounded-2xl overflow-y-auto p-6">
        {clusters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
            <Chats size={48} className="mb-4" />
            <p>No statements yet</p>
          </div>
        ) : (
          <div className="space-y-6">
            {clusters.map((cluster) => {
              const clusterStatements =
                statementsByCluster.get(cluster.index) || [];
              const color = getClusterColor(cluster.index);
              const isExpanded = expandedCluster === cluster.index;

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
                      {isExpanded ? "Hide" : "Show"} {cluster.statementCount}{" "}
                      statement{cluster.statementCount !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Statement pills - always visible */}
                  <div className="flex flex-wrap gap-2">
                    {clusterStatements.map((stmt) => (
                      <span
                        key={stmt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectStatement(stmt.id);
                          setExpandedCluster(cluster.index);
                        }}
                        className={`inline-flex items-center px-3 py-1 text-sm rounded-full border cursor-pointer transition-colors ${
                          stmt.id === selectedStatementId
                            ? "bg-slate-200 text-slate-800 border-slate-300"
                            : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-150 hover:border-slate-300"
                        }`}
                      >
                        {stmt.statementText.length > 30
                          ? `${stmt.statementText.slice(0, 30)}...`
                          : stmt.statementText}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
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
