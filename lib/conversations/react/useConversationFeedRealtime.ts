/**
 * Use Conversation Feed Realtime Hook
 *
 * Subscribes to broadcast channel for real-time feed updates.
 * Replaces postgres_changes subscription to avoid full feed refreshes.
 *
 * Architecture:
 * - Broadcast channel receives complete LiveResponse objects from server
 * - postgres_changes retained only for like updates (debounced)
 * - Clients append responses directly without loading state
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { LiveResponse, RealtimeStatus, FeedBroadcastPayload } from "../domain/listen.types";
import { getFeedChannelName, FEED_BROADCAST_EVENT } from "../server/broadcastResponse";

interface UseConversationFeedRealtimeOptions {
  conversationId: string;
  enabled?: boolean;
  onNewResponse: (response: LiveResponse) => void;
  onLikeUpdate?: () => void;
  /** Debounce time for like updates in ms (default: 1000) */
  likeDebounceMs?: number;
}

interface UseConversationFeedRealtimeResult {
  status: RealtimeStatus;
  error?: string;
}

/**
 * Hook for real-time feed updates via Supabase Broadcast channel.
 *
 * Features:
 * - Subscribes to broadcast channel for new responses (instant append)
 * - Subscribes to postgres_changes for like updates (debounced refresh)
 * - Reports connection status for UI indicator
 * - Cleans up subscriptions on unmount
 *
 * @param options - Hook configuration
 * @returns Connection status and any error
 */
export function useConversationFeedRealtime({
  conversationId,
  enabled = true,
  onNewResponse,
  onLikeUpdate,
  likeDebounceMs = 1000,
}: UseConversationFeedRealtimeOptions): UseConversationFeedRealtimeResult {
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const [error, setError] = useState<string | undefined>();

  // Refs to avoid stale closures in callbacks
  const onNewResponseRef = useRef(onNewResponse);
  const onLikeUpdateRef = useRef(onLikeUpdate);
  const likeDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs updated
  useEffect(() => {
    onNewResponseRef.current = onNewResponse;
  }, [onNewResponse]);

  useEffect(() => {
    onLikeUpdateRef.current = onLikeUpdate;
  }, [onLikeUpdate]);

  // Debounced like update handler
  const handleLikeUpdate = useCallback(() => {
    if (likeDebounceTimerRef.current) {
      clearTimeout(likeDebounceTimerRef.current);
    }
    likeDebounceTimerRef.current = setTimeout(() => {
      onLikeUpdateRef.current?.();
    }, likeDebounceMs);
  }, [likeDebounceMs]);

  useEffect(() => {
    if (!enabled || !supabase) {
      // Use a microtask to avoid synchronous setState in effect body
      queueMicrotask(() => setStatus("disconnected"));
      return;
    }

    queueMicrotask(() => {
      setStatus("connecting");
      setError(undefined);
    });

    const channelName = getFeedChannelName(conversationId);
    let channel: RealtimeChannel | null = null;

    // Create channel with broadcast and postgres_changes subscriptions
    channel = supabase
      .channel(channelName)
      // Broadcast subscription for new responses
      .on("broadcast", { event: FEED_BROADCAST_EVENT }, (payload) => {
        const data = payload.payload as FeedBroadcastPayload | undefined;
        if (data?.response) {
          onNewResponseRef.current(data.response);
        }
      })
      // postgres_changes subscription for like updates only
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "response_likes",
        },
        () => {
          handleLikeUpdate();
        }
      )
      .subscribe((subscriptionStatus, err) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("connected");
          setError(undefined);
        } else if (subscriptionStatus === "CHANNEL_ERROR" || err) {
          setStatus("error");
          setError(err?.message || "Failed to connect to realtime channel");
        } else if (subscriptionStatus === "CLOSED") {
          setStatus("disconnected");
        }
      });

    // Cleanup on unmount or when conversationId changes
    return () => {
      if (likeDebounceTimerRef.current) {
        clearTimeout(likeDebounceTimerRef.current);
      }
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [conversationId, enabled, handleLikeUpdate]);

  return { status, error };
}
