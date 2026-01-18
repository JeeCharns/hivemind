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

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import type { UnderstandViewModel } from "@/types/conversation-understand";
import UnderstandView from "./UnderstandView";
import { useConversationAnalysisRealtime } from "@/lib/conversations/react/useConversationAnalysisRealtime";
import { useAnalysisStatus } from "@/lib/conversations/react/useAnalysisStatus";
import { INCREMENTAL_THRESHOLD } from "@/lib/conversations/domain/thresholds";
import Button from "@/app/components/button";
import Alert from "@/app/components/alert";
import { ArrowsClockwise } from "@phosphor-icons/react";

export interface UnderstandViewContainerProps {
  initialViewModel: UnderstandViewModel;
  conversationType?: "understand" | "decide";
  isAdmin?: boolean;
}

function AnalysisAlert({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <Alert
      variant="warning"
      className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3">
        <div className="text-amber-600">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-amber-900">{title}</p>
          {subtitle && (
            <p className="text-xs text-amber-700">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </Alert>
  );
}

export default function UnderstandViewContainer({
  initialViewModel,
  conversationType = "understand",
  isAdmin = false,
}: UnderstandViewContainerProps) {
  const [viewModel, setViewModel] = useState(initialViewModel);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const lastReadyViewModelRef = useRef<UnderstandViewModel | null>(null);

  const {
    conversationId,
    analysisStatus,
    analysisError,
    responseCount = 0,
    threshold = 20,
    isAnalysisStale = false,
    newResponsesSinceAnalysis = 0,
    analysisResponseCount = null,
  } = viewModel;

  // Determine if analysis is actively running
  const analysisInProgress =
    analysisStatus === "embedding" ||
    analysisStatus === "analyzing" ||
    (analysisStatus === "not_started" &&
      (analysisResponseCount !== null || isGenerating || isRegenerating));

  const shouldShowStaleBanner =
    conversationType === "understand" &&
    analysisStatus === "ready" &&
    isAnalysisStale &&
    newResponsesSinceAnalysis >= INCREMENTAL_THRESHOLD;

  const hasGeneratedAnalysis =
    analysisStatus === "ready" ||
    analysisResponseCount !== null ||
    (viewModel.themes?.length ?? 0) > 0;

  const shouldShowGenerateBanner =
    conversationType === "understand" &&
    responseCount >= threshold &&
    !analysisInProgress &&
    !hasGeneratedAnalysis;

  // Fetch fresh understand data
  const fetchUnderstandData = useCallback(async () => {
    console.log("[Analysis] Fetching fresh understand data...");
    try {
      const res = await fetch(`/api/conversations/${conversationId}/understand`);
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`);
      }
      const data = await res.json();
      console.log("[Analysis] Received understand data:");
      console.log("[Analysis] → analysisStatus:", data.analysisStatus);
      console.log("[Analysis] → responseCount:", data.responseCount);
      console.log("[Analysis] → themes:", data.themes?.length ?? 0, "themes");
      console.log("[Analysis] → responses:", data.responses?.length ?? 0, "responses");
      if (data.analysisStatus === "ready") {
        console.log("[Analysis] ✓ Analysis complete!");
      }
      setViewModel(data);
    } catch (err) {
      console.error("[Analysis] Failed to refresh:", err);
    }
  }, [conversationId]);

  // Determine if we should enable realtime/polling
  const shouldSubscribe =
    responseCount >= threshold &&
    analysisStatus !== "ready" &&
    analysisStatus !== "error" &&
    analysisStatus !== null &&
    analysisStatus !== undefined;

  // Handle status updates from broadcast (update UI without full refresh)
  const handleStatusUpdate = useCallback(
    (status: string, error?: string | null) => {
      setViewModel((prev) => ({
        ...prev,
        analysisStatus: status as typeof prev.analysisStatus,
        analysisError: error ?? prev.analysisError,
      }));
    },
    []
  );

  // Subscribe to realtime updates (primary mechanism)
  const { status: realtimeStatus } = useConversationAnalysisRealtime({
    conversationId,
    enabled: shouldSubscribe,
    onRefresh: fetchUnderstandData,
    onStatusUpdate: handleStatusUpdate,
    debounceMs: 500,
  });

  // Polling safety net: only poll when realtime fails, with longer intervals
  // When realtime is connected, we don't need polling at all (broadcast handles it)
  // When realtime fails, poll every 30s as a safety net
  const shouldPollStatus = shouldSubscribe && realtimeStatus === "error";
  const statusPollingInterval = 30000; // 30s when polling (was 5s)

  // Fallback: Show UI indicator only when realtime is unavailable
  const useFallbackPolling =
    shouldSubscribe && realtimeStatus === "error";

  const { data: statusData } = useAnalysisStatus({
    conversationId,
    enabled: shouldPollStatus,
    interval: statusPollingInterval,
  });

  // Update from status polling
  useEffect(() => {
    if (shouldPollStatus && statusData) {
      console.log("[Analysis] Status poll update:");
      console.log("[Analysis] → analysisStatus:", statusData.analysisStatus);
      console.log("[Analysis] → responseCount:", statusData.responseCount);
      if (statusData.analysisError) {
        console.log("[Analysis] → analysisError:", statusData.analysisError);
      }

      setViewModel((prev) => ({
        ...prev,
        analysisStatus: statusData.analysisStatus,
        analysisError: statusData.analysisError,
        responseCount: statusData.responseCount,
      }));

      // Fetch full data when complete
      if (statusData.analysisStatus === "ready") {
        console.log("[Analysis] Status is ready, fetching full data...");
        fetchUnderstandData();
      }
    }
  }, [statusData, shouldPollStatus, fetchUnderstandData]);

  // Below threshold: show empty state
  if (responseCount < threshold) {
    const nextStepsCopy = isAdmin
      ? "Once you reach the minimum responses, you can generate a theme map from this tab."
      : "Once you reach the minimum responses, an admin can generate a theme map from this tab.";

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
              Once you reach {threshold} responses, a theme map can be generated for analysis.
            </p>
            <p className="text-sm text-slate-500 mt-4">
              {nextStepsCopy} Add more responses in the Listen tab or upload a CSV to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Initial analysis (first time, no existing data): show full-page loading state
  const hasNoExistingAnalysis = !viewModel.responses || viewModel.responses.length === 0;

  if (analysisInProgress && hasNoExistingAnalysis) {
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
            {isAdmin ? (
              <Button
                onClick={handleRetry}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Retry Analysis
              </Button>
            ) : (
              <p className="text-sm text-slate-500 mt-4">
                Ask an admin to retry the analysis.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Initial analysis handler
  const handleGenerate = async () => {
    if (!isAdmin) return;
    lastReadyViewModelRef.current = viewModel;
    try {
      setIsGenerating(true);
      setViewModel((prev) => ({
        ...prev,
        analysisStatus: "not_started",
        analysisError: null,
      }));

      const res = await fetch(`/api/conversations/${conversationId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          strategy: "auto",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error("[Generate] Failed:", data.error);
        if (lastReadyViewModelRef.current) {
          setViewModel(lastReadyViewModelRef.current);
        }
        return;
      }

      await fetchUnderstandData();
    } catch (err) {
      console.error("[Generate] Error:", err);
      if (lastReadyViewModelRef.current) {
        setViewModel(lastReadyViewModelRef.current);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Regenerate handler
  const handleRegenerate = async () => {
    if (!isAdmin) return;
    lastReadyViewModelRef.current = viewModel;
    console.log("[Analysis] Starting regeneration from UnderstandViewContainer...");
    console.log("[Analysis] → conversationId:", conversationId);
    try {
      setIsRegenerating(true);
      setViewModel((prev) => ({
        ...prev,
        analysisStatus: "not_started",
        analysisError: null,
      }));

      const res = await fetch(`/api/conversations/${conversationId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "regenerate",
          strategy: "full",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error("[Analysis] Regeneration failed:", data.error);
        if (lastReadyViewModelRef.current) {
          setViewModel(lastReadyViewModelRef.current);
        }
        return;
      }

      const responseData = await res.json().catch(() => null);
      console.log("[Analysis] Regeneration request accepted:", responseData);
      console.log("[Analysis] → Waiting for analysis to complete...");

      // Ensure we start polling/realtime immediately even if we missed the first update.
      await fetchUnderstandData();
    } catch (err) {
      console.error("[Analysis] Regeneration error:", err);
      if (lastReadyViewModelRef.current) {
        setViewModel(lastReadyViewModelRef.current);
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  // Analysis ready or regenerating: show view with optional stale banner
  // When regenerating, hide the banner and pass analysisInProgress to show left-column loading
  const showRegenerateButton = shouldShowStaleBanner && !analysisInProgress;

  return (
    <>
      {shouldShowGenerateBanner && (
        <AnalysisAlert
          title="Ready to generate themes"
          subtitle={
            isAdmin
              ? `You have ${responseCount} response${responseCount !== 1 ? "s" : ""}. Generate clusters to build the theme map.`
              : `You have ${responseCount} response${responseCount !== 1 ? "s" : ""}. Ask an admin to generate the theme map.`
          }
          action={
            isAdmin ? (
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
              >
                {isGenerating ? "Generating..." : "Generate"}
              </Button>
            ) : undefined
          }
        />
      )}
      {showRegenerateButton && (
        <AnalysisAlert
          title="Analysis out of date"
          subtitle={
            isAdmin
              ? `${newResponsesSinceAnalysis} new response${newResponsesSinceAnalysis !== 1 ? "s" : ""} since last analysis`
              : `${newResponsesSinceAnalysis} new response${newResponsesSinceAnalysis !== 1 ? "s" : ""} since last analysis. Ask an admin to regenerate.`
          }
          action={
            isAdmin ? (
              <Button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
              >
                {isRegenerating ? (
                  <>
                    <ArrowsClockwise size={16} className="animate-spin mr-2" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <ArrowsClockwise size={16} className="mr-2" />
                    Regenerate
                  </>
                )}
              </Button>
            ) : undefined
          }
        />
      )}
      <UnderstandView
        viewModel={viewModel}
        conversationType={conversationType}
        analysisInProgress={analysisInProgress}
      />
    </>
  );
}
