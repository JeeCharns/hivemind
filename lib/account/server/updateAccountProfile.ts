/**
 * updateAccountProfile - Server Service
 *
 * Updates user profile (display name and avatar)
 * Follows SRP: single responsibility of profile updates
 * Reuses profile services for consistency
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UpdateAccountProfileResponse } from "@/types/account-api";
import { upsertProfile, type UpsertProfileInput } from "@/lib/profile/server/upsertProfile";

/**
 * Update account profile
 *
 * This is a thin wrapper around upsertProfile for consistency
 * with the account settings domain
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @param input - Profile data (displayName + optional avatarFile)
 * @returns UpdateAccountProfileResponse with displayName and avatarUrl
 * @throws Error if update or upload fails
 */
export async function updateAccountProfile(
  supabase: SupabaseClient,
  userId: string,
  input: UpsertProfileInput
): Promise<UpdateAccountProfileResponse> {
  const result = await upsertProfile(supabase, userId, input);

  return {
    displayName: result.displayName,
    avatarUrl: result.avatarUrl,
  };
}
