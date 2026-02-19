'use client';

/**
 * useNotifications Hook
 *
 * Real-time notifications hook following the useHiveReactions pattern.
 * Subscribes to postgres_changes on user_notifications table.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Notification, NotificationRow } from '../domain/notification.types';

type NotificationStatus = 'connecting' | 'connected' | 'error' | 'disconnected';

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
    type: row.type as Notification['type'],
    title: row.title,
    body: row.body,
    hiveId: row.hive_id,
    conversationId: row.conversation_id,
    responseId: row.response_id ? String(row.response_id) : null,
    linkPath: row.link_path,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function useNotifications(userId: string | undefined): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<NotificationStatus>('disconnected');
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch notifications from API
  const refresh = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch('/api/notifications');
      if (!response.ok) {
        console.error('[useNotifications] Refresh failed:', response.status);
        return;
      }

      const data = await response.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (err) {
      console.error('[useNotifications] Refresh error:', err);
    }
  }, [userId]);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch('/api/notifications/read', { method: 'PATCH' });
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('[useNotifications] markAllRead error:', err);
    }
  }, [userId]);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch('/api/notifications', { method: 'DELETE' });
      if (response.ok) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('[useNotifications] clearAll error:', err);
    }
  }, [userId]);

  // Handle new notification from realtime
  const handleNewNotification = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === 'INSERT' && payload.new) {
        const row = payload.new as unknown as NotificationRow;
        const newNotification = mapRowToNotification(row);

        setNotifications((prev) => [newNotification, ...prev].slice(0, 20));
        setUnreadCount((prev) => prev + 1);
      }
    },
    []
  );

  // Initial fetch on mount
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    fetch('/api/notifications')
      .then(async (res) => {
        if (!res.ok) {
          console.error('[useNotifications] Initial fetch failed:', res.status);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[useNotifications] Initial fetch error:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Set up realtime subscription
  useEffect(() => {
    if (!supabase || !userId) {
      return;
    }

    queueMicrotask(() => setStatus('connecting'));

    const channelName = `user:${userId}:notifications`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        handleNewNotification
      )
      .subscribe((subscriptionStatus, err) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('connected');
        } else if (subscriptionStatus === 'CHANNEL_ERROR' || err) {
          setStatus('error');
        } else if (subscriptionStatus === 'CLOSED') {
          setStatus('disconnected');
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
