"use client";

/**
 * Use Hive Presence Hook
 *
 * Real-time presence tracking for hives using Supabase Presence.
 * Shows who's currently active in a hive.
 *
 * Architecture:
 * - Uses Supabase Presence API for real-time user tracking
 * - Each user tracks their own presence with displayName and avatarUrl
 * - Presence state syncs automatically across all clients
 * - Cleans up subscription on unmount or hive change
 */

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PresenceUser } from "../types";

type PresenceStatus = "connecting" | "connected" | "error" | "disconnected";

interface UseHivePresenceOptions {
  hiveId: string;
  userId: string;
  displayName?: string;
  avatarUrl?: string | null;
}

interface UseHivePresenceResult {
  activeUsers: PresenceUser[];
  status: PresenceStatus;
}

interface PresencePayload {
  displayName?: string;
  avatarUrl?: string | null;
  presence_ref?: string;
}

/**
 * Hook for real-time presence tracking in a hive.
 * Shows who's currently active in the hive.
 *
 * @param options - Hook configuration
 * @returns activeUsers array and connection status
 */
export function useHivePresence({
  hiveId,
  userId,
  displayName = "Anonymous",
  avatarUrl = null,
}: UseHivePresenceOptions): UseHivePresenceResult {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const [status, setStatus] = useState<PresenceStatus>("disconnected");
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase || !hiveId || !userId) {
      return;
    }

    // Debug: log what displayName we received
    console.log("[useHivePresence] Starting with displayName:", displayName);

    const channelName = `hive:${hiveId}:presence`;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        // Debug: log raw presence state
        console.log("[useHivePresence] Presence state:", JSON.stringify(state));
        const users: PresenceUser[] = [];

        for (const [key, presences] of Object.entries(state)) {
          const presence = (presences as PresencePayload[])[0];
          if (presence) {
            users.push({
              userId: key,
              displayName: presence.displayName || "Anonymous",
              avatarUrl: presence.avatarUrl || null,
              lastActiveAt: new Date().toISOString(),
            });
          }
        }

        setActiveUsers(users);
      })
      .subscribe(async (subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("connected");
          // Debug: log what we're tracking
          console.log("[useHivePresence] Tracking presence:", {
            displayName,
            avatarUrl,
          });
          // Track our own presence
          await channel.track({
            displayName,
            avatarUrl,
          });
        } else if (subscriptionStatus === "CHANNEL_ERROR") {
          setStatus("error");
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [hiveId, userId, displayName, avatarUrl]);

  return { activeUsers, status };
}
