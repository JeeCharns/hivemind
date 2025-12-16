/**
 * Hive Admin Authorization - Server-Side Security
 *
 * Verifies user has admin privileges for a hive
 * Follows SRP: single responsibility of authorization
 * Reusable across all admin-only operations
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Check if a user is an admin of a hive
 *
 * Security:
 * - Queries hive_members table to verify role
 * - Returns false if user is not a member or not an admin
 *
 * @param supabase - Supabase client
 * @param userId - User UUID to check
 * @param hiveId - Hive UUID
 * @returns True if user is an admin, false otherwise
 */
export async function authorizeHiveAdmin(
  supabase: SupabaseClient,
  userId: string,
  hiveId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", hiveId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[authorizeHiveAdmin] Query error:", error);
    return false;
  }

  if (!data) {
    console.warn("[authorizeHiveAdmin] User not a member:", { userId, hiveId });
    return false;
  }

  return data.role === "admin";
}

/**
 * Authorize admin and throw error if unauthorized
 *
 * Convenience function for server actions
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @param hiveId - Hive UUID
 * @throws Error if not authorized
 */
export async function requireHiveAdmin(
  supabase: SupabaseClient,
  userId: string,
  hiveId: string
): Promise<void> {
  const isAdmin = await authorizeHiveAdmin(supabase, userId, hiveId);

  if (!isAdmin) {
    throw new Error("Unauthorized: Admin access required");
  }
}
