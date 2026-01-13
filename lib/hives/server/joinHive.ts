/**
 * joinHive - Server Service
 *
 * Joins a user to a hive by upserting membership
 * Follows SRP: single responsibility of joining hives
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureProfileExists } from "@/lib/profiles/server/ensureProfileExists";

export interface JoinHiveResult {
  hiveId: string;
  hiveKey: string; // slug or id for routing
}

interface JoinHiveUser {
  id: string;
  email?: string;
}

/**
 * Join a user to a hive (idempotent)
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @param hiveId - Hive UUID to join
 * @returns JoinHiveResult with hiveId and hiveKey (slug fallback to id)
 * @throws Error if hive doesn't exist or upsert fails
 */
export async function joinHive(
  supabase: SupabaseClient,
  user: JoinHiveUser,
  hiveId: string
): Promise<JoinHiveResult> {
  // 0. Ensure profile exists (hive_members.user_id has FK to profiles in this schema)
  await ensureProfileExists(supabase, user);

  // 1. Confirm hive exists and check visibility
  const { data: hive, error: hiveError } = await supabase
    .from("hives")
    .select("id, slug, visibility")
    .eq("id", hiveId)
    .maybeSingle();

  if (hiveError) {
    console.error("[joinHive] Query error:", hiveError);
    throw new Error(`Failed to fetch hive: ${hiveError.message}`);
  }

  if (!hive) {
    throw new Error("Hive not found");
  }

  // 2. Block direct joins for private hives (must use invite link)
  if (hive.visibility === "private") {
    throw new Error("Hive is private");
  }

  // 3. Upsert membership (idempotent - onConflict handles existing memberships)
  const { error: upsertError } = await supabase
    .from("hive_members")
    .upsert(
      {
        hive_id: hive.id,
        user_id: user.id,
        role: "member",
      },
      { onConflict: "hive_id,user_id" }
    );

  if (upsertError) {
    console.error("[joinHive] Upsert error:", upsertError);
    throw new Error(`Failed to join hive: ${upsertError.message}`);
  }

  // 4. Return hive identifiers for routing
  return {
    hiveId: hive.id,
    hiveKey: hive.slug ?? hive.id,
  };
}
