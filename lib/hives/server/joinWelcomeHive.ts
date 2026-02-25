/**
 * joinWelcomeHive - Server Service
 *
 * Adds a user to the Welcome Hive.
 * Called on signup to give every new user a home.
 *
 * Idempotent: safe to call multiple times.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { WELCOME_HIVE_ID } from "../constants";

/**
 * Adds a user to the Welcome Hive.
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @returns true if joined, false if Welcome Hive doesn't exist
 * @throws Error if upsert fails for reasons other than missing hive
 */
export async function joinWelcomeHive(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  // Check if Welcome Hive exists first
  const { data: hive } = await supabase
    .from("hives")
    .select("id")
    .eq("id", WELCOME_HIVE_ID)
    .maybeSingle();

  if (!hive) {
    // Welcome Hive not seeded - this is OK, just skip
    console.log("[joinWelcomeHive] Welcome Hive not found, skipping auto-join");
    return false;
  }

  const { error } = await supabase.from("hive_members").upsert(
    {
      hive_id: WELCOME_HIVE_ID,
      user_id: userId,
      role: "member",
    },
    { onConflict: "hive_id,user_id" }
  );

  if (error) {
    console.error("[joinWelcomeHive] Error:", error);
    throw new Error("Failed to join Welcome Hive");
  }

  return true;
}
