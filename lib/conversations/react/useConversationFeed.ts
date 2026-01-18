/**
 * Use Conversation Feed Hook
 *
 * Manages conversation feed state with optimistic updates
 * Follows SRP: single responsibility of feed state management
 * Testable: accepts injected clients for mocking
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { LiveResponse, SubmitResponseInput } from "../domain/listen.types";
import type { IConversationResponsesClient } from "../data/responsesClient";
import type { IResponseLikesClient } from "../data/likesClient";
import { responsesClient } from "../data/responsesClient";
import { likesClient } from "../data/likesClient";

interface UseConversationFeedOptions {
  conversationId: string;
  responsesClient?: IConversationResponsesClient;
  likesClient?: IResponseLikesClient;
}

interface UseConversationFeedReturn {
  feed: LiveResponse[];
  isLoadingFeed: boolean;
  isSubmitting: boolean;
  error: string | null;
  /** Whether initial load has completed (used to prevent loading skeleton on refreshes) */
  hasLoadedOnce: boolean;
  submit: (input: SubmitResponseInput) => Promise<void>;
  toggleLike: (responseId: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Append a single response without loading state (for realtime updates) */
  appendResponse: (response: LiveResponse) => void;
  /** Refresh feed without showing loading state (for background sync) */
  silentRefresh: () => Promise<void>;
  /** Update a single response's like count (for broadcast updates) */
  updateResponseLikeCount: (responseId: string, likeCount: number) => void;
}

/**
 * Hook for managing conversation feed
 *
 * Features:
 * - Loads feed on mount
 * - Submits new responses with optimistic prepend
 * - Toggles likes with optimistic update and revert on failure
 * - Supports realtime updates via appendResponse (no loading state)
 * - Supports background sync via silentRefresh (no loading state)
 *
 * @param options - Hook configuration
 * @returns Feed state and actions
 */
export function useConversationFeed({
  conversationId,
  responsesClient: customResponsesClient,
  likesClient: customLikesClient,
}: UseConversationFeedOptions): UseConversationFeedReturn {
  const client = customResponsesClient || responsesClient;
  const likeClient = customLikesClient || likesClient;

  const [feed, setFeed] = useState<LiveResponse[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether initial load has completed
  const hasLoadedOnceRef = useRef(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Load feed on mount
  const loadFeed = useCallback(async () => {
    try {
      setIsLoadingFeed(true);
      setError(null);
      const responses = await client.list(conversationId);
      setFeed(responses);
      // Mark as loaded once after first successful load
      if (!hasLoadedOnceRef.current) {
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setIsLoadingFeed(false);
    }
  }, [conversationId, client]);

  useEffect(() => {
    // Reset hasLoadedOnce when conversationId changes
    hasLoadedOnceRef.current = false;
    setHasLoadedOnce(false);
    loadFeed();
  }, [loadFeed]);

  // Submit new response
  const submit = useCallback(
    async (input: SubmitResponseInput) => {
      try {
        setIsSubmitting(true);
        setError(null);

        const newResponse = await client.create(conversationId, input);

        // Optimistically prepend to feed
        setFeed((prev) => [newResponse, ...prev]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit response");
        throw err; // Re-throw for component to handle
      } finally {
        setIsSubmitting(false);
      }
    },
    [conversationId, client]
  );

  // Toggle like with optimistic update
  const toggleLike = useCallback(
    async (responseId: string) => {
      // Find the response
      const response = feed.find((r) => r.id === responseId);
      if (!response) return;

      const wasLiked = response.likedByMe;
      const previousFeed = [...feed];

      // Optimistic update
      setFeed((prev) =>
        prev.map((r) =>
          r.id === responseId
            ? {
                ...r,
                likedByMe: !wasLiked,
                likeCount: wasLiked ? r.likeCount - 1 : r.likeCount + 1,
              }
            : r
        )
      );

      try {
        // Perform actual toggle
        const result = wasLiked
          ? await likeClient.unlike(responseId)
          : await likeClient.like(responseId);

        if (!result.success) {
          // Revert on failure
          setFeed(previousFeed);
          setError(result.error || "Failed to toggle like");
        }
      } catch (err) {
        // Revert on error
        setFeed(previousFeed);
        setError(err instanceof Error ? err.message : "Failed to toggle like");
      }
    },
    [feed, likeClient]
  );

  // Refresh feed
  const refresh = useCallback(async () => {
    await loadFeed();
  }, [loadFeed]);

  // Silent refresh - refresh without showing loading state (for background sync)
  const silentRefresh = useCallback(async () => {
    try {
      setError(null);
      const responses = await client.list(conversationId);
      setFeed(responses);
    } catch (err) {
      // Don't set error for silent refresh - it's a background operation
      console.error("[useConversationFeed] Silent refresh failed:", err);
    }
  }, [conversationId, client]);

  // Append a single response without loading state (for realtime updates)
  const appendResponse = useCallback((response: LiveResponse) => {
    setFeed((prev) => {
      // Deduplicate: if response already exists, don't add again
      // This handles the case where the submitter already has it via optimistic update
      if (prev.some((r) => r.id === response.id)) {
        return prev;
      }
      // Prepend new response (newest first)
      return [response, ...prev];
    });
  }, []);

  // Update a single response's like count (for broadcast updates - no refetch needed)
  const updateResponseLikeCount = useCallback(
    (responseId: string, likeCount: number) => {
      setFeed((prev) =>
        prev.map((r) =>
          r.id === responseId
            ? { ...r, likeCount }
            : r
        )
      );
    },
    []
  );

  return {
    feed,
    isLoadingFeed,
    isSubmitting,
    error,
    hasLoadedOnce,
    submit,
    toggleLike,
    refresh,
    appendResponse,
    silentRefresh,
    updateResponseLikeCount,
  };
}
