/**
 * joinHive - Server Service
 *
 * Joins a user to a hive by upserting membership
 * Follows SRP: single responsibility of joining hives
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface JoinHiveResult {
  hiveId: string;
  hiveKey: string; // slug or id for routing
}

interface JoinHiveUser {
  id: string;
  email?: string;
}

function deriveDisplayName(email?: string): string {
  const trimmed = (email ?? "").trim().toLowerCase();
  if (!trimmed) return "User";
  const at = trimmed.indexOf("@");
  const localPart = at > 0 ? trimmed.slice(0, at) : trimmed;
  if (!localPart) return "User";
  return localPart.slice(0, 32);
}

async function ensureProfileExists(
  supabase: SupabaseClient,
  user: JoinHiveUser
): Promise<void> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[ensureProfileExists] Query error:", error);
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  if (profile) return;

  const displayName = deriveDisplayName(user.email);

  // Create a minimal profile row to satisfy foreign key constraints.
  // This should be allowed by RLS policies for the authenticated user.
  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    display_name: displayName,
  });

  if (insertError) {
    console.error("[ensureProfileExists] Insert error:", insertError);
    throw new Error(`Failed to initialize profile: ${insertError.message}`);
  }
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

  // 1. Confirm hive exists
  const { data: hive, error: hiveError } = await supabase
    .from("hives")
    .select("id, slug")
    .eq("id", hiveId)
    .maybeSingle();

  if (hiveError) {
    console.error("[joinHive] Query error:", hiveError);
    throw new Error(`Failed to fetch hive: ${hiveError.message}`);
  }

  if (!hive) {
    throw new Error("Hive not found");
  }

  // 2. Upsert membership (idempotent - onConflict handles existing memberships)
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

  // 3. Return hive identifiers for routing
  return {
    hiveId: hive.id,
    hiveKey: hive.slug ?? hive.id,
  };
}
