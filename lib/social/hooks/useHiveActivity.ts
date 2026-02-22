"use client";

/**
 * Use Hive Activity Hook
 *
 * Subscribes to postgres_changes on hive_activity table for real-time
 * activity feed updates in a hive.
 *
 * Features:
 * - Listens for INSERT events on hive_activity filtered by hive_id
 * - Prepends new events to the activity list
 * - Limits to 15 most recent events
 * - Reports connection status for UI indicator
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type { ActivityEvent, ActivityEventType } from "../types";

interface UseHiveActivityOptions {
  hiveId: string;
  initialActivity?: ActivityEvent[];
  /** Maximum number of events to keep in the list. Defaults to 15. */
  maxEvents?: number;
}

type ActivityStatus = "connecting" | "connected" | "error" | "disconnected";

interface UseHiveActivityResult {
  activity: ActivityEvent[];
  status: ActivityStatus;
}

/** Shape of the hive_activity row from Postgres */
interface HiveActivityRow {
  id: string;
  hive_id: string;
  event_type: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Hook for real-time activity feed in a hive.
 * Subscribes to new activity events via Postgres changes.
 *
 * @param options - Hook configuration
 * @returns Activity list and connection status
 */
export function useHiveActivity({
  hiveId,
  initialActivity = [],
  maxEvents = 15,
}: UseHiveActivityOptions): UseHiveActivityResult {
  const [activity, setActivity] = useState<ActivityEvent[]>(initialActivity);
  const [status, setStatus] = useState<ActivityStatus>("disconnected");
  const channelRef = useRef<RealtimeChannel | null>(null);

  const handleNewActivity = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as unknown as HiveActivityRow;

        const newEvent: ActivityEvent = {
          id: row.id,
          hiveId: row.hive_id,
          eventType: row.event_type as ActivityEventType,
          userId: row.user_id,
          metadata: row.metadata ?? {},
          createdAt: row.created_at,
        };

        setActivity((prev) => [newEvent, ...prev].slice(0, maxEvents));
      }
    },
    [maxEvents]
  );

  useEffect(() => {
    if (!supabase || !hiveId) {
      return;
    }

    // Use queueMicrotask to avoid synchronous setState in effect body
    queueMicrotask(() => setStatus("connecting"));

    const channelName = `hive:${hiveId}:activity`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "hive_activity",
          filter: `hive_id=eq.${hiveId}`,
        },
        handleNewActivity
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
  }, [hiveId, handleNewActivity]);

  return { activity, status };
}
