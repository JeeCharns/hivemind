"use client";

/**
 * useNotifications Hook
 *
 * Real-time notifications hook following the useHiveReactions pattern.
 * Subscribes to postgres_changes on user_notifications table.
 *
 * Features:
 * - Listens for INSERT events on user_notifications filtered by user_id
 * - Prepends new notifications to the list
 * - Limits to configurable max notifications (default 20)
 * - Reports connection status for UI indicator
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type {
  Notification,
  NotificationRow,
} from "../domain/notification.types";

type NotificationStatus = "connecting" | "connected" | "error" | "disconnected";

interface UseNotificationsOptions {
  userId: string | undefined;
  initialNotifications?: Notification[];
  /** Maximum number of notifications to keep in the list. Defaults to 20. */
  maxNotifications?: number;
}

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  status: NotificationStatus;
  markAllRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

function mapRowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as Notification["type"],
    title: row.title,
    body: row.body,
    hiveId: row.hive_id,
    conversationId: row.conversation_id,
    responseId: row.response_id,
    linkPath: row.link_path,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/**
 * Hook for real-time user notifications.
 * Subscribes to new notifications via Postgres changes.
 *
 * @param options - Hook configuration
 * @returns Notifications list, unread count, and actions
 */
export function useNotifications({
  userId,
  initialNotifications = [],
  maxNotifications = 20,
}: UseNotificationsOptions): UseNotificationsResult {
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(
    () => initialNotifications.filter((n) => n.readAt === null).length
  );
  const [status, setStatus] = useState<NotificationStatus>("disconnected");
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch notifications from API (silent refresh, no loading state)
  const refresh = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch("/api/notifications");
      if (!response.ok) {
        console.error("[useNotifications] Refresh failed:", response.status);
        return;
      }

      const data = await response.json();
      const fetched: Notification[] = data.notifications ?? [];
      setNotifications(fetched.slice(0, maxNotifications));
      setUnreadCount(data.unreadCount ?? 0);
    } catch (err) {
      console.error("[useNotifications] Refresh error:", err);
    }
  }, [userId, maxNotifications]);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch("/api/notifications/read", {
        method: "PATCH",
      });
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({
            ...n,
            readAt: n.readAt ?? new Date().toISOString(),
          }))
        );
        setUnreadCount(0);
      }
    } catch (err) {
      console.error("[useNotifications] markAllRead error:", err);
    }
  }, [userId]);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch("/api/notifications", { method: "DELETE" });
      if (response.ok) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.error("[useNotifications] clearAll error:", err);
    }
  }, [userId]);

  // Handle new notification from realtime
  const handleNewNotification = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as unknown as NotificationRow;
        const newNotification = mapRowToNotification(row);

        setNotifications((prev) =>
          [newNotification, ...prev].slice(0, maxNotifications)
        );
        setUnreadCount((prev) => prev + 1);
      }
    },
    [maxNotifications]
  );

  // Initial fetch on mount (only if no initial data provided)
  useEffect(() => {
    if (!userId || initialNotifications.length > 0) return;

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok || cancelled) return;

        const data = await response.json();
        if (cancelled) return;

        const fetched: Notification[] = data.notifications ?? [];
        setNotifications(fetched.slice(0, maxNotifications));
        setUnreadCount(data.unreadCount ?? 0);
      } catch (err) {
        if (cancelled) return;
        console.error("[useNotifications] Initial fetch error:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, initialNotifications.length, maxNotifications]);

  // Set up realtime subscription
  useEffect(() => {
    if (!supabase || !userId) {
      return;
    }

    queueMicrotask(() => setStatus("connecting"));

    const channelName = `user:${userId}:notifications`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${userId}`,
        },
        handleNewNotification
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
  }, [userId, handleNewNotification]);

  return {
    notifications,
    unreadCount,
    status,
    markAllRead,
    clearAll,
    refresh,
  };
}
