"use client";

/**
 * DiscussView - Client Component
 *
 * Main view component for the Discuss tab showing clustered statements
 * Left column: statement list grouped by cluster
 * Right column: selected statement detail with voting and comments
 */

import { useMemo } from "react";
import type { DeliberateViewModel, VoteValue } from "@/types/deliberate-space";
import StatementListCard from "./StatementListCard";
import StatementDetailPanel from "./StatementDetailPanel";
import { Chats } from "@phosphor-icons/react";

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

  return (
    <div className="flex h-full min-h-[600px]">
      {/* Left Column - Statement List */}
      <div className="w-2/5 border-r border-border-secondary overflow-y-auto p-4">
        {clusters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
            <Chats size={48} className="mb-4" />
            <p>No statements yet</p>
          </div>
        ) : (
          clusters.map((cluster) => {
            const clusterStatements = statementsByCluster.get(cluster.index) || [];
            return (
              <div key={cluster.index ?? "unclustered"} className="mb-6">
                <h3 className="text-label font-medium text-text-secondary mb-2">
                  {cluster.name || "Unclustered"}
                  <span className="ml-2 text-info text-text-tertiary">
                    ({cluster.statementCount})
                  </span>
                </h3>
                <div className="space-y-2">
                  {clusterStatements.map((stmt) => (
                    <StatementListCard
                      key={stmt.id}
                      statement={stmt}
                      isSelected={stmt.id === selectedStatementId}
                      onClick={() => onSelectStatement(stmt.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Right Column - Statement Detail */}
      <div className="w-3/5 overflow-y-auto">
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
            <p>Explore statements and give feedback here</p>
          </div>
        )}
      </div>
    </div>
  );
}
