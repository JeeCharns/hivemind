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
import Alert from "@/app/components/alert";
import { Chats, CheckCircle } from "@phosphor-icons/react";

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
  /** Whether the current user is an admin (can moderate comments) */
  isAdmin?: boolean;
  /** Set of statement IDs the user has interacted with (voted or passed) */
  interactedStatements?: Set<string>;
  /** Set of statement IDs the user has passed on */
  passedStatements?: Set<string>;
}

export default function DiscussView({
  viewModel,
  selectedStatementId,
  onSelectStatement,
  onVote,
  isAdmin = false,
  interactedStatements = new Set(),
  passedStatements = new Set(),
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

  // User has interacted if they voted (1-5) or passed
  const hasVoted = selectedStatement
    ? interactedStatements.has(selectedStatement.id)
    : false;

  // Check if user passed on the selected statement
  const hasPassed = selectedStatement
    ? passedStatements.has(selectedStatement.id)
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
        voteCount: stmt.voteCount,
        commentCount: stmt.commentCount,
      })),
    [statements]
  );

  // Count statements user hasn't interacted with yet
  const unvotedCount = useMemo(() => {
    return statements.filter((s) => !interactedStatements.has(s.id)).length;
  }, [statements, interactedStatements]);

  // Show completion banner when all statements voted
  const allVoted = unvotedCount === 0 && statements.length > 0;

  // Get ordered list of statements (by cluster index, then display order)
  const orderedStatements = useMemo(() => {
    return [...statements].sort((a, b) => {
      const clusterA = a.clusterIndex ?? -1;
      const clusterB = b.clusterIndex ?? -1;
      if (clusterA !== clusterB) return clusterA - clusterB;
      return a.displayOrder - b.displayOrder;
    });
  }, [statements]);

  // Find current index in ordered list
  const currentIndex = useMemo(() => {
    if (!selectedStatementId) return -1;
    return orderedStatements.findIndex((s) => s.id === selectedStatementId);
  }, [orderedStatements, selectedStatementId]);

  // Navigate to previous statement
  const handlePrevious = useCallback(() => {
    if (currentIndex <= 0) return;
    const prevStatement = orderedStatements[currentIndex - 1];
    onSelectStatement(prevStatement.id);
  }, [currentIndex, orderedStatements, onSelectStatement]);

  // Navigate to next statement (unvoted first, or chronologically if all voted)
  const handleNext = useCallback(() => {
    // If all voted, cycle through chronologically
    if (allVoted) {
      const nextIndex = (currentIndex + 1) % orderedStatements.length;
      onSelectStatement(orderedStatements[nextIndex].id);
      return;
    }

    // Find the next unvoted statement after the current position
    for (let i = currentIndex + 1; i < orderedStatements.length; i++) {
      if (!interactedStatements.has(orderedStatements[i].id)) {
        onSelectStatement(orderedStatements[i].id);
        return;
      }
    }

    // Wrap around - find first unvoted statement from the beginning
    for (let i = 0; i < currentIndex; i++) {
      if (!interactedStatements.has(orderedStatements[i].id)) {
        onSelectStatement(orderedStatements[i].id);
        return;
      }
    }
  }, [currentIndex, orderedStatements, onSelectStatement, interactedStatements, allVoted]);

  const canGoPrevious = currentIndex > 0;
  // Can go next if there are unvoted statements, or if all voted and there are multiple statements
  const canGoNext =
    unvotedCount > 0 || (allVoted && orderedStatements.length > 1);

  return (
    <div className="flex flex-col h-full min-h-[600px] py-4">
      {/* Completion banner */}
      {allVoted && (
        <Alert
          variant="success"
          className="mb-4 flex items-center gap-3"
        >
          <CheckCircle size={20} weight="fill" className="text-green-600 shrink-0" />
          <p className="text-sm font-medium">
            Amazing, you have voted on all the statements! Thank you for your participation.
          </p>
        </Alert>
      )}

      <div className="flex gap-6 flex-1">
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
            hasPassed={hasPassed}
            isAdmin={isAdmin}
            unvotedCount={unvotedCount}
            onPrevious={handlePrevious}
            onNext={handleNext}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
            <Chats size={48} className="mb-4" />
            <p>Select a statement to view details and vote</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
