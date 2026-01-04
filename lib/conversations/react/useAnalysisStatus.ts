/**
 * useAnalysisStatus Hook
 *
 * Client-side hook for polling analysis status
 * Follows SRP: single responsibility of status polling
 *
 * @deprecated Prefer useConversationAnalysisRealtime for push-based updates.
 * This hook is kept as a fallback mechanism when realtime is unavailable.
 */

import { useEffect, useState } from "react";
import type { GetAnalysisStatusResponse } from "../schemas";

interface UseAnalysisStatusOptions {
  conversationId: string;
  enabled?: boolean;
  interval?: number;
}

export function useAnalysisStatus({
  conversationId,
  enabled = true,
  interval = 5000,
}: UseAnalysisStatusOptions) {
  const [data, setData] = useState<GetAnalysisStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/analysis-status`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch analysis status");
        }

        const result = await response.json();
        setData(result);
        setError(null);

        // Continue polling only if analysis is actively in progress
        // Do NOT poll on "not_started" - that means no job has been triggered yet
        if (
          result.analysisStatus === "embedding" ||
          result.analysisStatus === "analyzing"
        ) {
          timeoutId = setTimeout(fetchStatus, interval);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [conversationId, enabled, interval]);

  return { data, loading, error };
}
