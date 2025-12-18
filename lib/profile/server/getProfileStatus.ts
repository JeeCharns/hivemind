/**
 * getProfileStatus - Server Service
 *
 * Checks if a user has a complete profile
 * Follows SRP: single responsibility of checking profile status
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileStatusResponse } from "@/types/profile-api";

/**
 * Get profile status for a user
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @returns ProfileStatusResponse with hasProfile and needsSetup flags
 * @throws Error if query fails
 */
export async function getProfileStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileStatusResponse> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[getProfileStatus] Query error:", error);
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  // If no profile row exists, user needs setup
  if (!profile) {
    return {
      hasProfile: false,
      needsSetup: true,
    };
  }

  // If profile exists but display_name is missing/empty, user needs setup
  const needsSetup = !profile.display_name || profile.display_name.trim() === "";

  return {
    hasProfile: true,
    needsSetup,
  };
}
