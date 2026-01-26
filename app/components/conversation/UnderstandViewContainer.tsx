"use client";

/**
 * UnderstandViewContainer - Container for Understand with realtime updates
 *
 * Handles:
 * - Empty state when < 20 responses
 * - Loading state during analysis
 * - Realtime push updates via Supabase (with polling fallback)
 * - Error state on analysis failure
 *
 * UI State Machine:
 * IDLE → STARTING → ANALYSING → LOADING_RESULTS → READY
 *                       ↓              ↓
 *                    ERROR ←──────────┘
 */

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import type { UnderstandViewModel } from "@/types/conversation-understand";
import UnderstandView from "./UnderstandView";
import {
  useConversationAnalysisRealtime,
  type AnalysisProgress,
} from "@/lib/conversations/react/useConversationAnalysisRealtime";
import { useAnalysisStatus } from "@/lib/conversations/react/useAnalysisStatus";
import Toast from "@/app/components/toast";
import { INCREMENTAL_THRESHOLD } from "@/lib/conversations/domain/thresholds";
import Button from "@/app/components/button";
import Alert from "@/app/components/alert";
import { ArrowsClockwise } from "@phosphor-icons/react";
import AnalysisProgressSteps from "./AnalysisProgressSteps";
import type { AnalysisProgressStage } from "@/lib/conversations/server/broadcastAnalysisStatus";

/**
 * UI state for the analysis flow
 * - idle: No analysis in progress, showing current data or empty state
 * - starting: User clicked generate/regenerate, showing immediate feedback
 * - analysing: Backend is processing, showing step-based progress
 * - loading_results: Analysis complete, fetching full data
 * - ready: Data loaded and displayed
 * - error: Analysis failed
 */
export type AnalysisUiState =
  | "idle"
  | "starting"
  | "analysing"
  | "loading_results"
  | "ready"
  | "error";

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

/**
 * Determine initial UI state based on analysis status
 */
function getInitialUiState(analysisStatus: string | null | undefined): AnalysisUiState {
  if (analysisStatus === "embedding" || analysisStatus === "analyzing") {
    return "analysing";
  }
  if (analysisStatus === "not_started") {
    return "starting";
  }
  if (analysisStatus === "error") {
    return "error";
  }
  return "idle";
}

export default function UnderstandViewContainer({
  initialViewModel,
  conversationType = "understand",
  isAdmin = false,
}: UnderstandViewContainerProps) {
  const [viewModel, setViewModel] = useState(initialViewModel);
  // Initialize uiState based on initial analysisStatus to handle page load during analysis
  const [uiState, setUiState] = useState<AnalysisUiState>(() =>
    getInitialUiState(initialViewModel.analysisStatus)
  );
  const lastReadyViewModelRef = useRef<UnderstandViewModel | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Derive legacy flags from uiState for backward compatibility
  const isGenerating = uiState === "starting" || uiState === "analysing";
  const isRegenerating = uiState === "starting" || uiState === "analysing";

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

  // Determine if analysis is actively running based on UI state
  // Show loading when in starting, analysing, or loading_results state
  const analysisInProgress =
    uiState === "starting" ||
    uiState === "analysing" ||
    uiState === "loading_results";

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
  // KEY FIX: Transition to "ready" state only after data is fetched
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

      // Update viewModel with fresh data
      setViewModel(data);

      // Only transition to ready state if data indicates analysis is complete
      // This ensures we don't clear loading state until we have the actual data
      if (data.analysisStatus === "ready") {
        console.log("[Analysis] ✓ Analysis complete - transitioning to ready state");
        setUiState("ready");
        setAnalysisProgress(null);
      }
    } catch (err) {
      console.error("[Analysis] Failed to refresh:", err);
      // On fetch error, still try to clear loading state to avoid stuck UI
      // But keep the previous data
      setUiState("idle");
      setAnalysisProgress(null);
    }
  }, [conversationId]);

  // Determine if we should enable realtime/polling
  // Subscribe when:
  // 1. UI state indicates we're expecting updates (starting, analysing, loading_results)
  // 2. Backend status indicates analysis in progress
  const shouldSubscribe =
    responseCount >= threshold &&
    (uiState === "starting" ||
      uiState === "analysing" ||
      uiState === "loading_results" ||
      analysisStatus === "embedding" ||
      analysisStatus === "analyzing" ||
      analysisStatus === "not_started");

  // Handle status updates from broadcast (update UI without full refresh)
  // KEY FIX: When status becomes "ready", transition to LOADING_RESULTS instead of
  // clearing loading state. Only transition to READY after data fetch completes.
  const handleStatusUpdate = useCallback(
    (status: string, error?: string | null) => {
      setViewModel((prev) => ({
        ...prev,
        analysisStatus: status as typeof prev.analysisStatus,
        analysisError: error ?? prev.analysisError,
      }));

      // If analysis failed, revert to previous state and show toast
      if (status === "error") {
        if (lastReadyViewModelRef.current) {
          setViewModel(lastReadyViewModelRef.current);
        }
        setAnalysisProgress(null);
        setUiState("error");
        setToastMessage("Analysis failed - please ask an admin to regenerate the analysis");
      }

      // When backend reports ready, transition to loading_results
      // The actual data fetch will happen via onRefresh callback
      // We'll transition to "ready" state after the fetch completes in fetchUnderstandData
      if (status === "ready") {
        setUiState("loading_results");
        // Keep analysisProgress for skeleton display context
      }

      // Update to analysing state when backend confirms it's processing
      if (status === "embedding" || status === "analyzing") {
        setUiState("analysing");
      }
    },
    []
  );

  // Handle progress updates from broadcast
  const handleProgressUpdate = useCallback((progress: AnalysisProgress) => {
    setAnalysisProgress(progress);
  }, []);

  // Subscribe to realtime updates (primary mechanism)
  const { status: realtimeStatus } = useConversationAnalysisRealtime({
    conversationId,
    enabled: shouldSubscribe,
    onRefresh: fetchUnderstandData,
    onStatusUpdate: handleStatusUpdate,
    onProgressUpdate: handleProgressUpdate,
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
    return (
      <div className="flex flex-col gap-6 pt-6 h-[calc(100vh-180px)]">
        <div className="bg-white rounded-2xl p-12 text-center">
          <div className="max-w-md mx-auto space-y-6">
            <h2 className="text-2xl font-semibold text-slate-800">
              Generating Theme Map
            </h2>

            {/* Step-based progress display */}
            <AnalysisProgressSteps
              progressStage={analysisProgress?.progressStage as AnalysisProgressStage | undefined}
              customMessage={analysisProgress?.progressMessage}
              size="md"
            />

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

  // Initial analysis handler with optimistic UI
  const handleGenerate = async () => {
    if (!isAdmin) return;

    // Store current state for rollback on error
    lastReadyViewModelRef.current = viewModel;

    // OPTIMISTIC: Immediately show starting state before API call
    setUiState("starting");
    setViewModel((prev) => ({
      ...prev,
      analysisStatus: "not_started",
      analysisError: null,
    }));

    try {
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
        // Revert on API failure
        if (lastReadyViewModelRef.current) {
          setViewModel(lastReadyViewModelRef.current);
        }
        setUiState("idle");
        setToastMessage("Failed to start analysis. Please try again.");
        return;
      }

      // API accepted - transition to analysing state
      // Realtime subscription will update progress from here
      setUiState("analysing");

      // Fetch initial status to sync with backend
      await fetchUnderstandData();
    } catch (err) {
      console.error("[Generate] Error:", err);
      // Revert on network error
      if (lastReadyViewModelRef.current) {
        setViewModel(lastReadyViewModelRef.current);
      }
      setUiState("idle");
      setToastMessage("Failed to start analysis. Please try again.");
    }
  };

  // Regenerate handler with optimistic UI
  const handleRegenerate = async () => {
    if (!isAdmin) return;

    // Store current state for rollback on error
    lastReadyViewModelRef.current = viewModel;
    console.log("[Analysis] Starting regeneration from UnderstandViewContainer...");
    console.log("[Analysis] → conversationId:", conversationId);

    // OPTIMISTIC: Immediately show starting state before API call
    setUiState("starting");
    setViewModel((prev) => ({
      ...prev,
      analysisStatus: "not_started",
      analysisError: null,
    }));

    try {
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
        // Revert on API failure
        if (lastReadyViewModelRef.current) {
          setViewModel(lastReadyViewModelRef.current);
        }
        setUiState("idle");
        setToastMessage("Failed to start regeneration. Please try again.");
        return;
      }

      const responseData = await res.json().catch(() => null);
      console.log("[Analysis] Regeneration request accepted:", responseData);
      console.log("[Analysis] → Waiting for analysis to complete...");

      // API accepted - transition to analysing state
      // Realtime subscription will update progress from here
      setUiState("analysing");

      // Fetch initial status to sync with backend
      await fetchUnderstandData();
    } catch (err) {
      console.error("[Analysis] Regeneration error:", err);
      // Revert on network error
      if (lastReadyViewModelRef.current) {
        setViewModel(lastReadyViewModelRef.current);
      }
      setUiState("idle");
      setToastMessage("Failed to start regeneration. Please try again.");
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
        analysisProgress={analysisProgress}
        uiState={uiState}
      />
      {toastMessage && (
        <Toast
          message={toastMessage}
          variant="error"
          onClose={() => setToastMessage(null)}
          duration={5000}
        />
      )}
    </>
  );
}
