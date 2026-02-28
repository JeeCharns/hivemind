"use client";

/**
 * DiscussView - Client Component
 *
 * Main view component for the Discuss tab showing clustered statements
 * Left column: Theme list panel (same as understand tab)
 * Right column: Selected statement detail with voting and comments
 */

import { useMemo, useCallback } from "react";
import type { DeliberateViewModel, VoteValue } from "@/types/deliberate-space";
import ThemeListPanel, {
  ThemeListCluster,
  ThemeListBucket,
} from "./ThemeListPanel";
import StatementDetailPanel from "./StatementDetailPanel";
import { Chats } from "@phosphor-icons/react";

// Color palette matching ThemeListPanel
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

  const selectedStatement = useMemo(
    () => statements.find((s) => s.id === selectedStatementId) ?? null,
    [statements, selectedStatementId]
  );

  const getThemeColor = useCallback((clusterIndex: number | null) => {
    if (clusterIndex === null) return "#94a3b8";
    return palette[clusterIndex % palette.length];
  }, []);

  const selectedThemeColor = useMemo(
    () =>
      selectedStatement
        ? getThemeColor(selectedStatement.clusterIndex)
        : "#94a3b8",
    [selectedStatement, getThemeColor]
  );

  const hasVoted = selectedStatement
    ? userVotes[selectedStatement.id] !== undefined &&
      userVotes[selectedStatement.id] !== null
    : false;

  // Map clusters to ThemeListPanel format
  const themeClusters: ThemeListCluster[] = useMemo(
    () =>
      clusters.map((c) => ({
        index: c.index,
        name: c.name,
      })),
    [clusters]
  );

  // Map statements to buckets format for ThemeListPanel
  const themeBuckets: ThemeListBucket[] = useMemo(
    () =>
      statements.map((stmt) => ({
        id: stmt.id,
        clusterIndex: stmt.clusterIndex,
        bucketName: stmt.statementTitle || getStatementTitle(stmt.statementText),
        consolidatedStatement: stmt.statementText,
        responseCount: stmt.originalResponseCount || undefined,
        sourceBucketId: stmt.sourceBucketId || undefined,
        sourceConversationId: stmt.sourceConversationId || undefined,
      })),
    [statements]
  );

  return (
    <div className="flex gap-6 h-full min-h-[600px] p-4">
      {/* Left Column - Theme List (same as understand tab) */}
      <div className="w-2/5 bg-white rounded-2xl overflow-y-auto p-6">
        {clusters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
            <Chats size={48} className="mb-4" />
            <p>No statements yet</p>
          </div>
        ) : (
          <ThemeListPanel
            clusters={themeClusters}
            buckets={themeBuckets}
            selectedBucketId={selectedStatementId}
            onSelectBucket={(id) => onSelectStatement(id)}
            emptyMessage="No statements yet."
          />
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
            themeColor={selectedThemeColor}
            hasVoted={hasVoted}
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
