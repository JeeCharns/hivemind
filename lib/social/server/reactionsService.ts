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
 * Note: hive_reactions.user_id references auth.users, not profiles,
 * so we fetch profiles separately and merge them.
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
  // 1. Fetch reactions
  const { data: reactions, error: reactionsError } = await supabase
    .from("hive_reactions")
    .select("id, hive_id, user_id, emoji, message, created_at")
    .eq("hive_id", hiveId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (reactionsError) {
    console.error("[getRecentReactions] Error fetching reactions:", reactionsError);
    return [];
  }

  if (!reactions || reactions.length === 0) {
    return [];
  }

  // 2. Get unique user IDs and fetch their profiles
  const userIds = [...new Set(reactions.map((r) => r.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  if (profilesError) {
    console.error("[getRecentReactions] Error fetching profiles:", profilesError);
    // Continue without display names rather than failing
  }

  // 3. Create a lookup map for display names
  const displayNameMap = new Map<string, string>();
  if (profiles) {
    for (const profile of profiles) {
      if (profile.display_name) {
        displayNameMap.set(profile.id, profile.display_name);
      }
    }
  }

  // 4. Merge reactions with display names
  return reactions.map((row) => ({
    id: row.id,
    hiveId: row.hive_id,
    userId: row.user_id,
    displayName: displayNameMap.get(row.user_id) ?? null,
    emoji: row.emoji,
    message: row.message,
    createdAt: row.created_at,
  }));
}
