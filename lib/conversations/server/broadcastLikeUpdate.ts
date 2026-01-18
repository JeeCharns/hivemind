/**
 * Broadcast Like Update Service
 *
 * Broadcasts like count updates to all feed subscribers via Supabase Broadcast channel.
 * This eliminates the need for clients to refetch when they receive postgres_changes events.
 *
 * Architecture:
 * - Server broadcasts complete like update after DB insert/delete
 * - Clients update local state directly without refetching
 * - Fire-and-forget: broadcast failures don't fail the API response
 */

import { createClient } from "@supabase/supabase-js";
import { getFeedChannelName } from "./broadcastResponse";

/**
 * Broadcast event type for like updates
 */
export const LIKE_UPDATE_EVENT = "like_update" as const;

export interface LikeUpdatePayload {
  responseId: string;
  likeCount: number;
  /** The user who triggered the like (so they can ignore their own broadcast) */
  userId: string;
}

interface BroadcastLikeUpdateInput {
  conversationId: string;
  payload: LikeUpdatePayload;
}

/**
 * Broadcasts a like count update to all feed subscribers.
 *
 * Uses service role client for reliable server-side broadcasting.
 * Errors are logged but not thrown - the API response should succeed
 * even if broadcast fails (clients have polling as fallback).
 *
 * @param input - The conversation ID and like payload to broadcast
 */
export async function broadcastLikeUpdate(
  input: BroadcastLikeUpdateInput
): Promise<void> {
  const { conversationId, payload } = input;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(
      "[broadcastLikeUpdate] Missing Supabase environment variables for broadcast"
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

    // Use the same channel as feed broadcasts
    const channelName = getFeedChannelName(conversationId);
    const channel = supabase.channel(channelName);

    // Subscribe briefly to send the broadcast
    await channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast",
          event: LIKE_UPDATE_EVENT,
          payload,
        });
      }
    });

    // Small delay to ensure message is sent, then cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
    await supabase.removeChannel(channel);
  } catch (error) {
    // Log but don't throw - broadcast failure shouldn't fail the API
    console.error("[broadcastLikeUpdate] Failed to broadcast:", error);
  }
}
