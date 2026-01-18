/**
 * useConversationAnalysisRealtime Hook
 *
 * Subscribes to Supabase Realtime for analysis status updates
 * Replaces polling with push-based updates
 * Follows SRP: single responsibility of realtime subscription management
 *
 * Listens to:
 * 1. postgres_changes on conversations table (analysis_status column)
 * 2. postgres_changes on conversation_themes table
 * 3. broadcast events from server (reliable push for status updates)
 */

import { useEffect, useRef, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Broadcast event type for analysis status updates (must match server)
 */
const ANALYSIS_STATUS_EVENT = "analysis_status" as const;

/**
 * Progress information for analysis
 */
export interface AnalysisProgress {
  /** Progress percentage 0-100 */
  progressPercent: number;
  /** Human-readable status message */
  progressMessage: string;
}

interface UseConversationAnalysisRealtimeOptions {
  conversationId: string;
  enabled?: boolean;
  onRefresh: () => void;
  onStatusUpdate?: (status: string, error?: string | null) => void;
  onProgressUpdate?: (progress: AnalysisProgress) => void;
  debounceMs?: number;
}

export type RealtimeStatus = "connecting" | "connected" | "error" | "disconnected";

export interface UseConversationAnalysisRealtimeResult {
  status: RealtimeStatus;
  error?: string;
}

/**
 * Debounce helper
 * Delays function execution until after delay has passed since last call
 */
function debounce<T extends (...args: unknown[]) => void>(func: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
}

/**
 * Hook for subscribing to analysis updates via Supabase Realtime
 *
 * Subscribes to:
 * 1. conversations table updates (analysis_status changes via postgres_changes)
 * 2. conversation_themes table changes (theme generation via postgres_changes)
 * 3. broadcast events from server (reliable push for status updates)
 *
 * When events arrive, calls onRefresh() to fetch fresh data
 * Debounces refresh calls to collapse bursts of updates
 *
 * @param options - Configuration object
 * @returns Realtime connection status
 */
export function useConversationAnalysisRealtime({
  conversationId,
  enabled = true,
  onRefresh,
  onStatusUpdate,
  onProgressUpdate,
  debounceMs = 500,
}: UseConversationAnalysisRealtimeOptions): UseConversationAnalysisRealtimeResult {
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const [error, setError] = useState<string | undefined>();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Create debounced refresh function
  const debouncedRefresh = useMemo(
    () => debounce(onRefresh, debounceMs),
    [onRefresh, debounceMs]
  );

  useEffect(() => {
    // Skip if not enabled
    if (!enabled) {
      return;
    }

    // Create channel name (must match server broadcastAnalysisStatus)
    const channelName = `analysis:${conversationId}`;

    // Create realtime channel with multiple listeners
    const channel = supabase
      .channel(channelName)
      // Listen for server-side broadcast events (most reliable)
      .on("broadcast", { event: ANALYSIS_STATUS_EVENT }, (payload) => {
        const data = payload.payload as {
          analysisStatus?: string;
          analysisError?: string | null;
          progress?: {
            progressPercent: number;
            progressMessage: string;
          };
        };
        console.log("[Analysis] Broadcast: status update received");
        console.log("[Analysis] → analysisStatus:", data.analysisStatus);
        if (data.progress) {
          console.log(
            `[Analysis] → progress: ${data.progress.progressPercent}% - ${data.progress.progressMessage}`
          );
        }

        // Notify parent of status change without full refresh
        if (onStatusUpdate && data.analysisStatus) {
          onStatusUpdate(data.analysisStatus, data.analysisError);
        }

        // Notify parent of progress update
        if (onProgressUpdate && data.progress) {
          onProgressUpdate({
            progressPercent: data.progress.progressPercent,
            progressMessage: data.progress.progressMessage,
          });
        }

        // Trigger refresh to get full data when ready
        if (data.analysisStatus === "ready") {
          console.log("[Analysis] → Analysis complete, fetching full data...");
          debouncedRefresh();
        }
      })
      // Listen for postgres_changes on conversations table (backup)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          const newStatus = (payload.new as { analysis_status?: string })?.analysis_status;
          console.log("[Analysis] Realtime: conversation updated");
          console.log("[Analysis] → analysis_status:", newStatus);
          if (newStatus === "embedding") {
            console.log("[Analysis] → Step 1/3: Generating embeddings...");
          } else if (newStatus === "analyzing") {
            console.log("[Analysis] → Step 2/3: Clustering and generating themes...");
          } else if (newStatus === "ready") {
            console.log("[Analysis] → Step 3/3: Analysis complete!");
          } else if (newStatus === "error") {
            console.log("[Analysis] → Analysis failed with error");
          }
          // Trigger refresh when analysis status changes
          debouncedRefresh();
        }
      )
      // Listen for postgres_changes on themes table
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_themes",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log("[Analysis] Realtime: themes updated");
          console.log("[Analysis] → event:", payload.eventType);
          // Trigger refresh when themes are inserted/updated/deleted
          debouncedRefresh();
        }
      )
      .subscribe((status) => {
        console.log("[Analysis] Realtime subscription:", status);

        if (status === "SUBSCRIBED") {
          console.log("[Analysis] ✓ Live updates enabled - listening for changes...");
          setStatus("connected");
          setError(undefined);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.log("[Analysis] ✗ Realtime connection failed, falling back to polling");
          setStatus("error");
          setError(`Realtime connection ${status.toLowerCase()}`);
        } else if (status === "CLOSED") {
          setStatus("disconnected");
          setError(undefined);
        }
      });

    // Store channel reference
    channelRef.current = channel;

    // Cleanup on unmount or when conversationId/enabled changes
    return () => {
      if (channelRef.current) {
        console.log("[realtime] unsubscribing from channel:", channelName);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId, enabled, debouncedRefresh, onStatusUpdate, onProgressUpdate]);

  const effectiveStatus = enabled ? status : "disconnected";
  const effectiveError = enabled && status === "error" ? error : undefined;

  return { status: effectiveStatus, error: effectiveError };
}
