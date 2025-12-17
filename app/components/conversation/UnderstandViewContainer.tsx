"use client";

/**
 * UnderstandViewContainer - Container for Understand with realtime updates
 *
 * Handles:
 * - Empty state when < 20 responses
 * - Loading state during analysis
 * - Realtime push updates via Supabase (with polling fallback)
 * - Error state on analysis failure
 */

import { useEffect, useState, useCallback } from "react";
import type { UnderstandViewModel } from "@/types/conversation-understand";
import UnderstandView from "./UnderstandView";
import { useConversationAnalysisRealtime } from "@/lib/conversations/react/useConversationAnalysisRealtime";
import { useAnalysisStatus } from "@/lib/conversations/react/useAnalysisStatus";
import Button from "@/app/components/button";

export interface UnderstandViewContainerProps {
  initialViewModel: UnderstandViewModel;
  conversationType?: "understand" | "decide";
}

export default function UnderstandViewContainer({
  initialViewModel,
  conversationType = "understand",
}: UnderstandViewContainerProps) {
  const [viewModel, setViewModel] = useState(initialViewModel);

  const {
    conversationId,
    analysisStatus,
    analysisError,
    responseCount = 0,
    threshold = 20,
  } = viewModel;

  // Fetch fresh understand data
  const fetchUnderstandData = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/understand`);
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`);
      }
      const data = await res.json();
      setViewModel(data);
    } catch (err) {
      console.error("[UnderstandViewContainer] Failed to refresh:", err);
    }
  }, [conversationId]);

  // Determine if we should enable realtime/polling
  const shouldSubscribe =
    responseCount >= threshold &&
    analysisStatus !== "ready" &&
    analysisStatus !== "error";

  // Subscribe to realtime updates (primary mechanism)
  const { status: realtimeStatus, error: realtimeError } =
    useConversationAnalysisRealtime({
      conversationId,
      enabled: shouldSubscribe,
      onRefresh: fetchUnderstandData,
      debounceMs: 500,
    });

  // Fallback: Poll if realtime connection fails
  const useFallbackPolling =
    shouldSubscribe && realtimeStatus === "error";

  const { data: statusData } = useAnalysisStatus({
    conversationId,
    enabled: useFallbackPolling,
    interval: 5000,
  });

  // Update from polling fallback
  useEffect(() => {
    if (useFallbackPolling && statusData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewModel((prev) => ({
        ...prev,
        analysisStatus: statusData.analysisStatus,
        analysisError: statusData.analysisError,
        responseCount: statusData.responseCount,
      }));

      // Fetch full data when complete
      if (statusData.analysisStatus === "ready") {
        fetchUnderstandData();
      }
    }
  }, [statusData, useFallbackPolling, analysisStatus, fetchUnderstandData]);

  // Below threshold: show empty state
  if (responseCount < threshold) {
    return (
      <div className="flex flex-col gap-6 pt-6 h-[calc(100vh-180px)]">
        <div className="bg-white rounded-2xl p-12 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-semibold text-slate-800">
              Need {threshold} Responses for Themes
            </h2>
            <p className="text-slate-600">
              You currently have {responseCount} response{responseCount !== 1 ? "s" : ""}.
              Once you reach {threshold} responses, we&apos;ll automatically generate a theme map
              and cluster your responses for analysis.
            </p>
            <p className="text-sm text-slate-500 mt-4">
              Add more responses in the Listen tab or upload a CSV to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Analysis in progress: show loading state
  if (
    analysisStatus === "not_started" ||
    analysisStatus === "embedding" ||
    analysisStatus === "analyzing"
  ) {
    const statusMessage =
      analysisStatus === "embedding"
        ? "Generating embeddings..."
        : analysisStatus === "analyzing"
        ? "Clustering responses and generating themes..."
        : "Queued for analysis...";

    return (
      <div className="flex flex-col gap-6 pt-6 h-[calc(100vh-180px)]">
        <div className="bg-white rounded-2xl p-12 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <div className="animate-pulse text-6xl mb-4">🔮</div>
            <h2 className="text-2xl font-semibold text-slate-800">
              Generating Theme Map
            </h2>
            <p className="text-slate-600">{statusMessage}</p>
            <div className="flex items-center justify-center gap-2 mt-6">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
            </div>
            <p className="text-sm text-slate-500 mt-6">
              This usually takes 30-60 seconds. We&apos;ll update automatically when ready.
            </p>
            {realtimeStatus === "connected" && (
              <p className="text-xs text-emerald-600 mt-2">
                ● Live updates enabled
              </p>
            )}
            {useFallbackPolling && (
              <p className="text-xs text-amber-600 mt-2">
                ⟳ Using fallback polling (realtime unavailable)
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Analysis error: show error state with retry
  if (analysisStatus === "error") {
    const handleRetry = async () => {
      try {
        await fetch(`/api/conversations/${conversationId}/analyze`, {
          method: "POST",
        });
        // Reload page to start polling again
        window.location.reload();
      } catch (err) {
        console.error("Failed to retry analysis:", err);
      }
    };

    return (
      <div className="flex flex-col gap-6 pt-6 h-[calc(100vh-180px)]">
        <div className="bg-white rounded-2xl p-12 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-semibold text-slate-800">
              Analysis Failed
            </h2>
            <p className="text-slate-600">
              We encountered an error while generating your theme map.
            </p>
            {analysisError && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {analysisError}
              </p>
            )}
            <Button
              onClick={handleRetry}
              className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Retry Analysis
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Analysis ready: show normal view
  return <UnderstandView viewModel={viewModel} conversationType={conversationType} />;
}
