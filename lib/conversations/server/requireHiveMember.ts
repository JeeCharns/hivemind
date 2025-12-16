/**
 * Require Hive Member - Server-Side Authorization
 *
 * Verifies user is a member of a hive
 * Follows SRP: single responsibility of membership check
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkHiveMembership } from "@/lib/navbar/data/hiveRepository";

/**
 * Require user to be a member of a hive
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @param hiveId - Hive UUID
 * @throws Error if user is not a member
 */
export async function requireHiveMember(
  supabase: SupabaseClient,
  userId: string,
  hiveId: string
): Promise<void> {
  const isMember = await checkHiveMembership(supabase, userId, hiveId);

  if (!isMember) {
    throw new Error("Unauthorized: User is not a member of this hive");
  }
}
