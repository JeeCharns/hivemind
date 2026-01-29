/**
 * useConversationFeedback Hook - Feedback Management
 *
 * Manages feedback voting with optimistic updates
 * Follows DIP: accepts client injection for testing
 */

import { useState, useCallback, useEffect } from "react";
import type { Feedback, FeedbackItem } from "@/types/conversation-understand";
import {
  feedbackClient as defaultFeedbackClient,
  type IConversationFeedbackClient,
} from "../data/feedbackClient";

export interface UseConversationFeedbackOptions {
  conversationId: string;
  initialItems: FeedbackItem[];
  feedbackClient?: IConversationFeedbackClient;
}

export interface UseConversationFeedbackReturn {
  items: FeedbackItem[];
  vote: (responseId: string, feedback: Feedback) => Promise<void>;
  loadingId: string | null;
  error: string | null;
}

/**
 * Hook for managing conversation feedback with optimistic updates
 *
 * Features:
 * - Optimistic UI updates (immediate feedback)
 * - Automatic revert on failure
 * - Loading state per response
 * - Dependency injection for testing
 */
export function useConversationFeedback({
  conversationId,
  initialItems,
  feedbackClient: customFeedbackClient,
}: UseConversationFeedbackOptions): UseConversationFeedbackReturn {
  const client = customFeedbackClient || defaultFeedbackClient;

  const [items, setItems] = useState<FeedbackItem[]>(initialItems);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync items when initialItems change (e.g. after analysis completes and
  // feedbackItems are re-fetched with updated clusterIndex values).
  // Preserves in-flight optimistic vote state by merging counts/current
  // from existing items when a vote is in progress.
  useEffect(() => {
    setItems((prev) => {
      // If nothing is loading, take the new items wholesale
      if (!loadingId) return initialItems;

      // Merge: use new data but keep optimistic vote state for the loading item
      const prevById = new Map(prev.map((i) => [i.id, i]));
      return initialItems.map((item) => {
        const existing = prevById.get(item.id);
        if (existing && existing.id === loadingId) {
          // Preserve optimistic counts/current, but update everything else
          return { ...item, counts: existing.counts, current: existing.current };
        }
        return item;
      });
    });
  }, [initialItems, loadingId]);

  /**
   * Vote on a response with optimistic update
   * Supports toggle-off: clicking the same button withdraws the vote
   */
  const vote = useCallback(
    async (responseId: string, feedback: Feedback) => {
      // Find the item
      const item = items.find((i) => i.id === responseId);
      if (!item) return;

      // Store previous state for revert
      const previousItem = { ...item };

      // Check if this is a toggle-off (clicking the same button)
      const isToggleOff = item.current === feedback;

      // Optimistic update
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== responseId) return i;

          const newCounts = { ...i.counts };
          let newCurrent: Feedback | null = feedback;

          if (isToggleOff) {
            // Toggle off: decrement the current choice and set current to null
            newCounts[feedback] = Math.max(0, newCounts[feedback] - 1);
            newCurrent = null;
          } else {
            // Switching or new vote
            // Decrement previous choice if exists
            if (i.current) {
              newCounts[i.current] = Math.max(0, newCounts[i.current] - 1);
            }

            // Increment new choice
            newCounts[feedback] = newCounts[feedback] + 1;
          }

          return {
            ...i,
            counts: newCounts,
            current: newCurrent,
          };
        })
      );

      // Submit to server
      setLoadingId(responseId);
      setError(null);

      try {
        const result = await client.vote(conversationId, responseId, feedback);

        if (!result.success) {
          // Revert on failure
          setItems((prev) =>
            prev.map((i) => (i.id === responseId ? previousItem : i))
          );
          setError(result.error || "Failed to submit feedback");
        } else if (result.counts) {
          // Update with server counts (in case of race conditions)
          // After toggle-off, current should be null
          setItems((prev) =>
            prev.map((i) =>
              i.id === responseId
                ? { ...i, counts: result.counts!, current: isToggleOff ? null : feedback }
                : i
            )
          );
        }
      } catch (err) {
        // Revert on error
        setItems((prev) =>
          prev.map((i) => (i.id === responseId ? previousItem : i))
        );
        setError(err instanceof Error ? err.message : "Failed to submit feedback");
      } finally {
        setLoadingId(null);
      }
    },
    [conversationId, client, items]
  );

  return {
    items,
    vote,
    loadingId,
    error,
  };
}
