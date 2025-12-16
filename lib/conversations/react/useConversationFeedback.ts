/**
 * useConversationFeedback Hook - Feedback Management
 *
 * Manages feedback voting with optimistic updates
 * Follows DIP: accepts client injection for testing
 */

import { useState, useCallback } from "react";
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

  /**
   * Vote on a response with optimistic update
   */
  const vote = useCallback(
    async (responseId: string, feedback: Feedback) => {
      // Find the item
      const item = items.find((i) => i.id === responseId);
      if (!item) return;

      // Store previous state for revert
      const previousItem = { ...item };

      // Optimistic update
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== responseId) return i;

          const newCounts = { ...i.counts };
          const newCurrent = feedback;

          // Decrement previous choice if exists
          if (i.current) {
            newCounts[i.current] = Math.max(0, newCounts[i.current] - 1);
          }

          // Increment new choice
          newCounts[feedback] = newCounts[feedback] + 1;

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
          setItems((prev) =>
            prev.map((i) =>
              i.id === responseId
                ? { ...i, counts: result.counts!, current: feedback }
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
