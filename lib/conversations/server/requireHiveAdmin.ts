/**
 * Require Hive Admin - Server-Side Authorization
 *
 * Verifies user is an admin of a hive
 * Reuses existing authorization logic
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireHiveAdmin as requireAdmin } from "@/lib/hives/server/authorizeHiveAdmin";

/**
 * Require user to be an admin of a hive
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @param hiveId - Hive UUID
 * @throws Error if user is not an admin
 */
export async function requireHiveAdmin(
  supabase: SupabaseClient,
  userId: string,
  hiveId: string
): Promise<void> {
  await requireAdmin(supabase, userId, hiveId);
}
