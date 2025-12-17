/**
 * getAccountSettings - Server Service
 *
 * Fetches account settings for display in settings page
 * Follows SRP: single responsibility of fetching account data
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountSettingsResponse } from "@/types/account-api";
import { getAvatarUrl } from "@/lib/storage/server/getAvatarUrl";

/**
 * Get account settings for a user
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @param email - User email from session
 * @returns AccountSettingsResponse with email, displayName, and avatarUrl
 * @throws Error if query fails
 */
export async function getAccountSettings(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<AccountSettingsResponse> {
  // Fetch profile data
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, avatar_path")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[getAccountSettings] Query error:", error);
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  // Get avatar URL if path exists
  let avatarUrl: string | null = null;
  if (profile?.avatar_path) {
    avatarUrl = await getAvatarUrl(supabase, profile.avatar_path);
  }

  return {
    email,
    displayName: profile?.display_name ?? null,
    avatarUrl,
  };
}
