/**
 * ModerationHistoryView - Client Component
 *
 * Displays moderation history grouped by flag category
 * Admins can reinstate moderated responses
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import ConfirmationModal from "@/app/components/ConfirmationModal";
import {
  MODERATION_FLAGS,
  MODERATION_FLAG_LABELS,
  type ModerationFlag,
  type ModerationLogEntry,
} from "@/types/moderation";

interface ModerationHistoryViewProps {
  conversationId: string;
  isAdmin: boolean;
}

export default function ModerationHistoryView({
  conversationId,
  isAdmin,
}: ModerationHistoryViewProps) {
  const [history, setHistory] = useState<ModerationLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reinstateId, setReinstateId] = useState<number | null>(null);
  const [isReinstating, setIsReinstating] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/moderation`);
      if (!res.ok) {
        throw new Error("Failed to fetch moderation history");
      }
      const data = await res.json();
      setHistory(data.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const reinstateResponse = async () => {
    if (!reinstateId) return;

    // Find the response ID from the log entry
    const logEntry = history.find((h) => h.id === reinstateId);
    if (!logEntry) return;

    setIsReinstating(true);

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/responses/${logEntry.responseId}/reinstate`,
        { method: "POST" }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reinstate");
      }

      // Refresh history
      await fetchHistory();
      setReinstateId(null);
    } catch (err) {
      console.error("Reinstate failed:", err);
    } finally {
      setIsReinstating(false);
    }
  };

  // Group history by flag, showing latest action per response
  const groupedByFlag = MODERATION_FLAGS.reduce(
    (acc, flag) => {
      // Get all entries for this flag
      const entriesForFlag = history.filter((h) => h.flag === flag);

      // Group by responseId, keeping all entries (for showing reinstatement status)
      const byResponseId = new Map<number, ModerationLogEntry[]>();
      entriesForFlag.forEach((entry) => {
        const existing = byResponseId.get(entry.responseId) || [];
        existing.push(entry);
        byResponseId.set(entry.responseId, existing);
      });

      // For each response, determine if it's currently reinstated
      const processedEntries: Array<{
        entry: ModerationLogEntry;
        isReinstated: boolean;
        reinstatedAt?: string;
      }> = [];

      byResponseId.forEach((entries) => {
        // Sort by performed_at descending
        const sorted = [...entries].sort(
          (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()
        );

        const latestAction = sorted[0];
        const isReinstated = latestAction.action === "reinstated";

        // Find the original moderation entry
        const moderationEntry = sorted.find((e) => e.action === "moderated");
        if (moderationEntry) {
          processedEntries.push({
            entry: moderationEntry,
            isReinstated,
            reinstatedAt: isReinstated ? latestAction.performedAt : undefined,
          });
        }
      });

      if (processedEntries.length > 0) {
        acc[flag] = processedEntries;
      }

      return acc;
    },
    {} as Record<ModerationFlag, Array<{
      entry: ModerationLogEntry;
      isReinstated: boolean;
      reinstatedAt?: string;
    }>>
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl p-6">
        <h2 className="text-h3 text-text-primary mb-4">Moderation History</h2>
        <div className="h-32 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-6">
        <h2 className="text-h3 text-text-primary mb-4">Moderation History</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const hasAnyEntries = Object.keys(groupedByFlag).length > 0;

  return (
    <div className="bg-white rounded-2xl p-6">
      <h2 className="text-h3 text-text-primary mb-6">Moderation History</h2>

      {!hasAnyEntries ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center text-slate-600">
          No moderated responses yet.
        </div>
      ) : (
        <div className="space-y-8">
          {MODERATION_FLAGS.map((flag) => {
            const entries = groupedByFlag[flag];
            if (!entries || entries.length === 0) return null;

            const { emoji, label } = MODERATION_FLAG_LABELS[flag];

            return (
              <div key={flag} className="space-y-3">
                <h3 className="text-h4 text-text-primary flex items-center gap-2">
                  <span>{emoji}</span>
                  <span>{label}</span>
                  <span className="text-slate-400 font-normal">({entries.length})</span>
                </h3>

                <div className="space-y-3">
                  {entries.map(({ entry, isReinstated, reinstatedAt }) => (
                    <div
                      key={entry.id}
                      className={`bg-slate-50 border rounded-lg p-4 ${
                        isReinstated ? "border-slate-200 opacity-75" : "border-slate-300"
                      }`}
                    >
                      <p className="text-body text-text-primary mb-2">
                        {entry.responseText}
                      </p>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3 text-info text-slate-500">
                          <span>
                            Moderated {formatDate(entry.performedAt)}
                          </span>
                          <span>by {entry.performedBy.name}</span>
                          {isReinstated && reinstatedAt && (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs">
                              Reinstated {formatDate(reinstatedAt)}
                            </span>
                          )}
                        </div>
                        {isAdmin && !isReinstated && (
                          <button
                            type="button"
                            onClick={() => setReinstateId(entry.id)}
                            className="flex items-center gap-1 text-info text-indigo-600 hover:text-indigo-700 transition"
                          >
                            <ArrowCounterClockwise size={14} />
                            Reinstate
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationModal
        isOpen={reinstateId !== null}
        title="Reinstate response?"
        message="Are you sure you want to reinstate this opinion? It will reappear in the live feed."
        confirmLabel="Reinstate"
        cancelLabel="Cancel"
        onConfirm={reinstateResponse}
        onCancel={() => setReinstateId(null)}
        isLoading={isReinstating}
      />
    </div>
  );
}
