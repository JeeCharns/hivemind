/**
 * useBucketResponses - Hook for lazy-loading bucket responses
 *
 * Fetches responses for a cluster bucket on demand with pagination support.
 * Used for incremental loading in the Understand tab.
 */

import { useState, useCallback } from "react";
import type { BucketResponse } from "@/types/conversation-understand";

interface BucketResponsesState {
  responses: BucketResponse[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
}

interface UseBucketResponsesOptions {
  conversationId: string;
  bucketId: string;
  /** Number of responses to fetch per page */
  pageSize?: number;
}

interface UseBucketResponsesReturn extends BucketResponsesState {
  /** Fetch initial responses (resets state) */
  loadResponses: () => Promise<void>;
  /** Load more responses (appends to existing) */
  loadMore: () => Promise<void>;
  /** Reset state */
  reset: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

export function useBucketResponses({
  conversationId,
  bucketId,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseBucketResponsesOptions): UseBucketResponsesReturn {
  const [state, setState] = useState<BucketResponsesState>({
    responses: [],
    isLoading: false,
    error: null,
    hasMore: true,
    total: 0,
  });

  const loadResponses = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const url = `/api/conversations/${conversationId}/buckets/${bucketId}/responses?offset=0&limit=${pageSize}`;
      const res = await fetch(url);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to fetch responses: ${res.status}`
        );
      }

      const data = await res.json();

      setState({
        responses: data.responses || [],
        isLoading: false,
        error: null,
        hasMore: data.hasMore ?? false,
        total: data.total ?? 0,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load responses",
      }));
    }
  }, [conversationId, bucketId, pageSize]);

  const loadMore = useCallback(async () => {
    if (state.isLoading || !state.hasMore) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const offset = state.responses.length;
      const url = `/api/conversations/${conversationId}/buckets/${bucketId}/responses?offset=${offset}&limit=${pageSize}`;
      const res = await fetch(url);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to fetch responses: ${res.status}`
        );
      }

      const data = await res.json();

      setState((prev) => ({
        responses: [...prev.responses, ...(data.responses || [])],
        isLoading: false,
        error: null,
        hasMore: data.hasMore ?? false,
        total: data.total ?? prev.total,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to load more responses",
      }));
    }
  }, [
    conversationId,
    bucketId,
    pageSize,
    state.isLoading,
    state.hasMore,
    state.responses.length,
  ]);

  const reset = useCallback(() => {
    setState({
      responses: [],
      isLoading: false,
      error: null,
      hasMore: true,
      total: 0,
    });
  }, []);

  return {
    ...state,
    loadResponses,
    loadMore,
    reset,
  };
}
