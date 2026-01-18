/**
 * Broadcast Analysis Status Service
 *
 * Broadcasts analysis status updates to all subscribers via Supabase Broadcast channel.
 * This provides reliable push-based updates for analysis status changes.
 *
 * Architecture:
 * - Worker/server broadcasts status after DB update
 * - Clients subscribe to channel and update status directly
 * - Fire-and-forget: broadcast failures don't fail the operation
 * - Complements postgres_changes with explicit server-initiated broadcasts
 */

import { createClient } from "@supabase/supabase-js";

/**
 * Channel name format for analysis status broadcasts
 */
export function getAnalysisChannelName(conversationId: string): string {
  return `analysis:${conversationId}`;
}

/**
 * Broadcast event type for analysis status updates
 */
export const ANALYSIS_STATUS_EVENT = "analysis_status" as const;

export interface AnalysisStatusPayload {
  analysisStatus: "not_started" | "embedding" | "analyzing" | "ready" | "error";
  analysisError?: string | null;
  responseCount?: number;
  analysisResponseCount?: number;
}

interface BroadcastAnalysisStatusInput {
  conversationId: string;
  payload: AnalysisStatusPayload;
}

/**
 * Broadcasts an analysis status update to all subscribers.
 *
 * Uses service role client for reliable server-side broadcasting.
 * Errors are logged but not thrown - the operation should succeed
 * even if broadcast fails (clients have polling as fallback).
 *
 * @param input - The conversation ID and status payload to broadcast
 */
export async function broadcastAnalysisStatus(
  input: BroadcastAnalysisStatusInput
): Promise<void> {
  const { conversationId, payload } = input;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(
      "[broadcastAnalysisStatus] Missing Supabase environment variables for broadcast"
    );
    return;
  }

  try {
    // Use service role client for server-side broadcast
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const channelName = getAnalysisChannelName(conversationId);
    const channel = supabase.channel(channelName);

    // Subscribe briefly to send the broadcast
    await channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast",
          event: ANALYSIS_STATUS_EVENT,
          payload,
        });
      }
    });

    // Small delay to ensure message is sent, then cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
    await supabase.removeChannel(channel);

    console.log(
      `[broadcastAnalysisStatus] Broadcast ${payload.analysisStatus} for ${conversationId}`
    );
  } catch (error) {
    // Log but don't throw - broadcast failure shouldn't fail the operation
    console.error("[broadcastAnalysisStatus] Failed to broadcast:", error);
  }
}
