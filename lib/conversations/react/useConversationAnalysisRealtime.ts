/**
 * useConversationAnalysisRealtime Hook
 *
 * Subscribes to Supabase Realtime for analysis status updates
 * Replaces polling with push-based updates
 * Follows SRP: single responsibility of realtime subscription management
 */

import { useEffect, useRef, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseConversationAnalysisRealtimeOptions {
  conversationId: string;
  enabled?: boolean;
  onRefresh: () => void;
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
 * 1. conversations table updates (analysis_status changes)
 * 2. conversation_themes table changes (theme generation)
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

    // Create channel name
    const channelName = `analysis:${conversationId}`;

    // Create realtime channel
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          console.log("[realtime] conversations update:", payload);
          // Trigger refresh when analysis status changes
          debouncedRefresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_themes",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log("[realtime] conversation_themes change:", payload);
          // Trigger refresh when themes are inserted/updated/deleted
          debouncedRefresh();
        }
      )
      .subscribe((status) => {
        console.log("[realtime] subscription status:", status);

        if (status === "SUBSCRIBED") {
          setStatus("connected");
          setError(undefined);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
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
  }, [conversationId, enabled, debouncedRefresh]);

  const effectiveStatus = enabled ? status : "disconnected";
  const effectiveError = enabled && status === "error" ? error : undefined;

  return { status: effectiveStatus, error: effectiveError };
}
