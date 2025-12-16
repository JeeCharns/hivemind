/**
 * Use Conversation Feed Hook
 *
 * Manages conversation feed state with optimistic updates
 * Follows SRP: single responsibility of feed state management
 * Testable: accepts injected clients for mocking
 */

import { useState, useEffect, useCallback } from "react";
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
  submit: (input: SubmitResponseInput) => Promise<void>;
  toggleLike: (responseId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing conversation feed
 *
 * Features:
 * - Loads feed on mount
 * - Submits new responses with optimistic prepend
 * - Toggles likes with optimistic update and revert on failure
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

  // Load feed on mount
  const loadFeed = useCallback(async () => {
    try {
      setIsLoadingFeed(true);
      setError(null);
      const responses = await client.list(conversationId);
      setFeed(responses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setIsLoadingFeed(false);
    }
  }, [conversationId, client]);

  useEffect(() => {
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

  return {
    feed,
    isLoadingFeed,
    isSubmitting,
    error,
    submit,
    toggleLike,
    refresh,
  };
}
