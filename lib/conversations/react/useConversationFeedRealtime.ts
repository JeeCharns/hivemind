/**
 * Use Conversation Feed Realtime Hook
 *
 * Subscribes to broadcast channel for real-time feed updates.
 * Uses server-initiated broadcasts to eliminate refetch cascades.
 *
 * Architecture:
 * - Broadcast channel receives complete LiveResponse objects from server
 * - Broadcast channel receives like count updates from server
 * - Clients update local state directly without refetching
 * - postgres_changes removed for likes (replaced by broadcast)
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  LiveResponse,
  RealtimeStatus,
  FeedBroadcastPayload,
} from "../domain/listen.types";
import {
  getFeedChannelName,
  FEED_BROADCAST_EVENT,
} from "../server/broadcastResponse";
import {
  LIKE_UPDATE_EVENT,
  type LikeUpdatePayload,
} from "../server/broadcastLikeUpdate";

interface UseConversationFeedRealtimeOptions {
  conversationId: string;
  enabled?: boolean;
  /**
   * When true, unsubscribes from realtime updates (used for high-traffic degradation).
   * The hook will disconnect while paused and reconnect when unpaused.
   */
  paused?: boolean;
  onNewResponse: (response: LiveResponse) => void;
  /** Called when a like count update is broadcast. Provides responseId and new count. */
  onLikeUpdate?: (responseId: string, likeCount: number) => void;
  /** Current user ID to ignore own broadcasts (optional optimization) */
  currentUserId?: string;
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
 * - Subscribes to broadcast channel for like updates (direct state update)
 * - Reports connection status for UI indicator
 * - Cleans up subscriptions on unmount
 *
 * @param options - Hook configuration
 * @returns Connection status and any error
 */
export function useConversationFeedRealtime({
  conversationId,
  enabled = true,
  paused = false,
  onNewResponse,
  onLikeUpdate,
  currentUserId,
}: UseConversationFeedRealtimeOptions): UseConversationFeedRealtimeResult {
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const [error, setError] = useState<string | undefined>();

  // Refs to avoid stale closures in callbacks
  const onNewResponseRef = useRef(onNewResponse);
  const onLikeUpdateRef = useRef(onLikeUpdate);
  const currentUserIdRef = useRef(currentUserId);

  // Keep refs updated
  useEffect(() => {
    onNewResponseRef.current = onNewResponse;
  }, [onNewResponse]);

  useEffect(() => {
    onLikeUpdateRef.current = onLikeUpdate;
  }, [onLikeUpdate]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    // Disconnect if disabled or paused (high-traffic degradation)
    if (!enabled || paused || !supabase) {
      // Use a microtask to avoid synchronous setState in effect body
      queueMicrotask(() => setStatus(paused ? "paused" : "disconnected"));
      return;
    }

    queueMicrotask(() => {
      setStatus("connecting");
      setError(undefined);
    });

    const channelName = getFeedChannelName(conversationId);
    let channel: RealtimeChannel | null = null;

    // Create channel with broadcast subscriptions (no postgres_changes for likes)
    channel = supabase
      .channel(channelName)
      // Broadcast subscription for new responses
      .on("broadcast", { event: FEED_BROADCAST_EVENT }, (payload) => {
        const data = payload.payload as FeedBroadcastPayload | undefined;
        if (data?.response) {
          onNewResponseRef.current(data.response);
        }
      })
      // Broadcast subscription for like updates (replaces postgres_changes)
      .on("broadcast", { event: LIKE_UPDATE_EVENT }, (payload) => {
        const data = payload.payload as LikeUpdatePayload | undefined;
        if (data && onLikeUpdateRef.current) {
          // Optionally skip if this is our own broadcast (we already updated locally)
          // But still process it - in case of race conditions, server count is authoritative
          onLikeUpdateRef.current(data.responseId, data.likeCount);
        }
      })
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
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [conversationId, enabled, paused]);

  return { status, error };
}
