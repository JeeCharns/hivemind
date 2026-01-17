/**
 * Broadcast Response Service
 *
 * Broadcasts new responses to all subscribers via Supabase Broadcast channel.
 * This enables real-time feed updates without requiring clients to refetch.
 *
 * Architecture:
 * - Server broadcasts complete LiveResponse after successful DB insert
 * - Clients subscribe to channel and append responses directly
 * - Fire-and-forget: broadcast failures don't fail the API response
 */

import { createClient } from "@supabase/supabase-js";
import type { LiveResponse } from "../domain/listen.types";

/**
 * Channel name format for feed broadcasts
 */
export function getFeedChannelName(conversationId: string): string {
  return `feed:${conversationId}`;
}

/**
 * Broadcast event type for new responses
 */
export const FEED_BROADCAST_EVENT = "new_response" as const;

interface BroadcastResponseInput {
  conversationId: string;
  response: LiveResponse;
}

/**
 * Broadcasts a new response to all feed subscribers.
 *
 * Uses service role client for reliable server-side broadcasting.
 * Errors are logged but not thrown - the API response should succeed
 * even if broadcast fails (clients have background sync as fallback).
 *
 * @param input - The conversation ID and response to broadcast
 */
export async function broadcastResponse(input: BroadcastResponseInput): Promise<void> {
  const { conversationId, response } = input;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[broadcastResponse] Missing Supabase environment variables for broadcast");
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

    const channelName = getFeedChannelName(conversationId);
    const channel = supabase.channel(channelName);

    // Subscribe briefly to send the broadcast
    await channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast",
          event: FEED_BROADCAST_EVENT,
          payload: { response },
        });
      }
    });

    // Small delay to ensure message is sent, then cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
    await supabase.removeChannel(channel);
  } catch (error) {
    // Log but don't throw - broadcast failure shouldn't fail the API
    console.error("[broadcastResponse] Failed to broadcast response:", error);
  }
}
