/**
 * Use Conversation Presence Hook
 *
 * Tracks how many users are currently viewing a conversation.
 * Uses Supabase Realtime Presence for real-time viewer counts.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseConversationPresenceOptions {
  conversationId: string;
  enabled?: boolean;
}

interface UseConversationPresenceResult {
  viewerCount: number;
  isConnected: boolean;
}

/**
 * Get the presence channel name for a conversation
 */
export function getPresenceChannelName(conversationId: string): string {
  return `presence:${conversationId}`;
}

/**
 * Hook for tracking conversation viewers using Supabase Presence.
 *
 * Features:
 * - Tracks current user as present
 * - Reports total viewer count in real-time
 * - Cleans up presence on unmount
 *
 * @param options - Hook configuration
 * @returns Viewer count and connection status
 */
export function useConversationPresence({
  conversationId,
  enabled = true,
}: UseConversationPresenceOptions): UseConversationPresenceResult {
  const [viewerCount, setViewerCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !supabase) {
      queueMicrotask(() => {
        setIsConnected(false);
        setViewerCount(0);
      });
      return;
    }

    const channelName = getPresenceChannelName(conversationId);
    let channel: RealtimeChannel | null = null;

    channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: crypto.randomUUID(),
        },
      },
    });

    // Handle presence sync events
    channel.on("presence", { event: "sync" }, () => {
      if (!channel) return;
      const state = channel.presenceState();
      const count = Object.keys(state).length;
      setViewerCount(count);
    });

    // Subscribe and track presence
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && channel) {
        setIsConnected(true);
        // Track this user as present
        await channel.track({
          online_at: new Date().toISOString(),
        });
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        setIsConnected(false);
      }
    });

    // Cleanup on unmount
    return () => {
      if (channel) {
        channel.untrack();
        supabase.removeChannel(channel);
      }
    };
  }, [conversationId, enabled]);

  return { viewerCount, isConnected };
}
