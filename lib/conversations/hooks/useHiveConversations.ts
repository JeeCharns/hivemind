'use client';

/**
 * Use Hive Conversations Hook
 *
 * Subscribes to postgres_changes on conversations table for real-time
 * updates when new conversations are created in a hive.
 *
 * Features:
 * - Listens for INSERT events on conversations filtered by hive_id
 * - Adds new conversations to the list
 * - Orders by created_at descending (newest first)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { ConversationCardData, ConversationType, ConversationPhase, AnalysisStatus } from '@/types/conversations';

interface UseHiveConversationsOptions {
  hiveId: string;
  initialConversations?: ConversationCardData[];
}

interface UseHiveConversationsResult {
  conversations: ConversationCardData[];
  status: 'connecting' | 'connected' | 'error' | 'disconnected';
}

/** Shape of the conversations row from Postgres */
interface ConversationRow {
  id: string;
  hive_id: string;
  slug: string | null;
  type: string;
  title: string | null;
  description: string | null;
  created_at: string;
  analysis_status: string;
  report_json: unknown | null;
  phase: string;
  source_conversation_id: string | null;
}

/**
 * Hook for real-time conversations in a hive.
 * Subscribes to new conversations via Postgres changes.
 *
 * @param options - Hook configuration
 * @returns Conversations list and connection status
 */
export function useHiveConversations({
  hiveId,
  initialConversations = [],
}: UseHiveConversationsOptions): UseHiveConversationsResult {
  const [conversations, setConversations] = useState<ConversationCardData[]>(initialConversations);
  const [status, setStatus] = useState<UseHiveConversationsResult['status']>('disconnected');
  const channelRef = useRef<RealtimeChannel | null>(null);

  const handleConversationChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === 'INSERT' && payload.new) {
        const row = payload.new as unknown as ConversationRow;

        // Only add if it's for this hive
        if (row.hive_id !== hiveId) return;

        const newConversation: ConversationCardData = {
          id: row.id,
          slug: row.slug,
          type: row.type as ConversationType,
          title: row.title,
          description: row.description,
          created_at: row.created_at,
          analysis_status: row.analysis_status as AnalysisStatus,
          report_json: row.report_json,
          phase: row.phase as ConversationPhase,
          source_conversation_id: row.source_conversation_id,
          response_count: 0, // New conversations have no responses
        };

        // Add to front of list (newest first)
        setConversations((prev) => {
          // Avoid duplicates
          if (prev.some((c) => c.id === newConversation.id)) {
            return prev;
          }
          return [newConversation, ...prev];
        });
      } else if (payload.eventType === 'UPDATE' && payload.new) {
        const row = payload.new as unknown as ConversationRow;

        // Update existing conversation
        setConversations((prev) =>
          prev.map((c) =>
            c.id === row.id
              ? {
                  ...c,
                  slug: row.slug,
                  title: row.title,
                  description: row.description,
                  analysis_status: row.analysis_status as AnalysisStatus,
                  report_json: row.report_json,
                  phase: row.phase as ConversationPhase,
                }
              : c
          )
        );
      } else if (payload.eventType === 'DELETE' && payload.old) {
        const oldRow = payload.old as unknown as { id: string };
        setConversations((prev) => prev.filter((c) => c.id !== oldRow.id));
      }
    },
    [hiveId]
  );

  useEffect(() => {
    if (!supabase || !hiveId) {
      return;
    }

    // Use queueMicrotask to avoid synchronous setState in effect body
    queueMicrotask(() => setStatus('connecting'));

    const channelName = `hive:${hiveId}:conversations`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'conversations',
          filter: `hive_id=eq.${hiveId}`,
        },
        handleConversationChange
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
  }, [hiveId, handleConversationChange]);

  return { conversations, status };
}
