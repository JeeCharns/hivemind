"use client";

/**
 * Use Hive Reactions Hook
 *
 * Subscribes to postgres_changes on hive_reactions table for real-time
 * reaction wall updates in a hive.
 *
 * Features:
 * - Listens for INSERT events on hive_reactions filtered by hive_id
 * - Prepends new reactions to the list
 * - Limits to 20 most recent reactions
 * - Reports connection status for UI indicator
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type { Reaction, ReactionEmoji } from "../types";

interface UseHiveReactionsOptions {
  hiveId: string;
  initialReactions?: Reaction[];
  /** Maximum number of reactions to keep in the list. Defaults to 20. */
  maxReactions?: number;
}

type ReactionStatus = "connecting" | "connected" | "error" | "disconnected";

interface UseHiveReactionsResult {
  reactions: Reaction[];
  status: ReactionStatus;
  /** Refresh reactions from the server (silent, no loading state) */
  refresh: () => Promise<void>;
}

/** Shape of the hive_reactions row from Postgres */
interface HiveReactionRow {
  id: string;
  hive_id: string;
  user_id: string;
  emoji: string;
  message: string | null;
  created_at: string;
}

/**
 * Hook for real-time reactions in a hive.
 * Subscribes to new/updated reactions via Postgres changes.
 *
 * @param options - Hook configuration
 * @returns Reactions list and connection status
 */
export function useHiveReactions({
  hiveId,
  initialReactions = [],
  maxReactions = 20,
}: UseHiveReactionsOptions): UseHiveReactionsResult {
  const [reactions, setReactions] = useState<Reaction[]>(initialReactions);
  const [status, setStatus] = useState<ReactionStatus>("disconnected");
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Silent refresh - fetches latest reactions from server
  const refresh = useCallback(async () => {
    if (!supabase || !hiveId) return;

    try {
      // Fetch reactions
      const { data: reactionsData, error: reactionsError } = await supabase
        .from("hive_reactions")
        .select("id, hive_id, user_id, emoji, message, created_at")
        .eq("hive_id", hiveId)
        .order("created_at", { ascending: false })
        .limit(maxReactions);

      if (reactionsError || !reactionsData) {
        console.error("[useHiveReactions] Refresh error:", reactionsError);
        return;
      }

      // Fetch profiles for display names
      const userIds = [...new Set(reactionsData.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);

      const displayNameMap = new Map<string, string>();
      if (profiles) {
        for (const profile of profiles) {
          if (profile.display_name) {
            displayNameMap.set(profile.id, profile.display_name);
          }
        }
      }

      // Update state
      setReactions(
        reactionsData.map((row) => ({
          id: row.id,
          hiveId: row.hive_id,
          userId: row.user_id,
          displayName: displayNameMap.get(row.user_id) ?? null,
          emoji: row.emoji as ReactionEmoji,
          message: row.message,
          createdAt: row.created_at,
        }))
      );
    } catch (err) {
      console.error("[useHiveReactions] Refresh error:", err);
    }
  }, [hiveId, maxReactions]);

  const handleNewReaction = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as unknown as HiveReactionRow;

        const newReaction: Reaction = {
          id: row.id,
          hiveId: row.hive_id,
          userId: row.user_id,
          displayName: null, // Real-time events don't include joined profile data
          emoji: row.emoji as ReactionEmoji,
          message: row.message,
          createdAt: row.created_at,
        };

        setReactions((prev) => [newReaction, ...prev].slice(0, maxReactions));
      }
    },
    [maxReactions]
  );

  useEffect(() => {
    if (!supabase || !hiveId) {
      return;
    }

    // Use queueMicrotask to avoid synchronous setState in effect body
    queueMicrotask(() => setStatus("connecting"));

    const channelName = `hive:${hiveId}:reactions`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "hive_reactions",
          filter: `hive_id=eq.${hiveId}`,
        },
        handleNewReaction
      )
      .subscribe((subscriptionStatus, err) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("connected");
        } else if (subscriptionStatus === "CHANNEL_ERROR" || err) {
          setStatus("error");
        } else if (subscriptionStatus === "CLOSED") {
          setStatus("disconnected");
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [hiveId, handleNewReaction]);

  return { reactions, status, refresh };
}
