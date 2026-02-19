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
 * @throws Error if upsert fails
 */
export async function joinWelcomeHive(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
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
}
