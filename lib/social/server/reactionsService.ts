/**
 * Reactions Service
 *
 * Server-side service for managing hive reactions (emoji wall).
 * Handles adding and fetching reactions for the Welcome Hive feature.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reaction, ReactionInput } from "../types";

/**
 * Adds or updates a reaction for a user in a hive.
 * Uses upsert to ensure one reaction per emoji type per user.
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @param input - Reaction data (hiveId, emoji, optional message)
 * @throws Error if upsert fails
 */
export async function addReaction(
  supabase: SupabaseClient,
  userId: string,
  input: ReactionInput
): Promise<void> {
  const { error } = await supabase.from("hive_reactions").upsert(
    {
      hive_id: input.hiveId,
      user_id: userId,
      emoji: input.emoji,
      message: input.message ?? null,
    },
    { onConflict: "hive_id,user_id,emoji" }
  );

  if (error) {
    console.error("[addReaction] Error:", error);
    throw new Error("Failed to add reaction");
  }
}

/**
 * Fetches recent reactions for a hive.
 * Returns reactions ordered by most recent first.
 *
 * @param supabase - Supabase client
 * @param hiveId - Hive UUID
 * @param limit - Maximum number of reactions to fetch (default: 20)
 * @returns Array of Reaction objects, empty array on error
 */
export async function getRecentReactions(
  supabase: SupabaseClient,
  hiveId: string,
  limit: number = 20
): Promise<Reaction[]> {
  const { data, error } = await supabase
    .from("hive_reactions")
    .select(
      `
      id,
      hive_id,
      user_id,
      emoji,
      message,
      created_at,
      profiles!hive_reactions_user_id_fkey(display_name)
    `
    )
    .eq("hive_id", hiveId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getRecentReactions] Error:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    // Supabase returns joined profile as object for to-one FK relationship
    const profile = row.profiles as unknown as { display_name: string } | null;
    return {
      id: row.id,
      hiveId: row.hive_id,
      userId: row.user_id,
      displayName: profile?.display_name ?? null,
      emoji: row.emoji,
      message: row.message,
      createdAt: row.created_at,
    };
  });
}
