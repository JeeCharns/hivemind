/**
 * Get Hive Settings - Server-Side Data Access
 *
 * Fetches hive settings data with proper authorization
 * Follows SOLID principles:
 * - SRP: Single responsibility of fetching settings
 * - Security: Verifies user membership before returning data
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HiveSettingsViewModel } from "@/types/hive-settings";
import { checkHiveMembership } from "@/lib/navbar/data/hiveRepository";
import { getLogoSignedUrl } from "@/lib/storage/server/logoStorage";
import { isHttpUrl } from "@/lib/storage/validation";

/**
 * Fetch hive settings for display
 *
 * Security:
 * - Verifies requester is a member of the hive
 * - Generates signed URLs for private logo storage
 *
 * @param supabase - Supabase client
 * @param hiveId - Hive UUID
 * @param requesterId - User UUID of requester
 * @returns Hive settings view model
 * @throws Error if requester is not a member or query fails
 */
export async function getHiveSettings(
  supabase: SupabaseClient,
  hiveId: string,
  requesterId: string
): Promise<HiveSettingsViewModel> {
  // 1. Security: Verify requester is a member
  const isMember = await checkHiveMembership(supabase, requesterId, hiveId);
  if (!isMember) {
    throw new Error("Unauthorized: User is not a member of this hive");
  }

  // 2. Fetch hive settings
  const { data: hive, error } = await supabase
    .from("hives")
    .select("id, name, logo_url")
    .eq("id", hiveId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch hive settings: ${error.message}`);
  }

  if (!hive) {
    throw new Error("Hive not found");
  }

  // 3. Resolve logo URL
  let logoUrl: string | null = null;

  if (hive.logo_url) {
    // If already a full URL (OAuth provider), use it directly
    if (isHttpUrl(hive.logo_url)) {
      logoUrl = hive.logo_url;
    } else {
      // Generate signed URL for private storage
      logoUrl = await getLogoSignedUrl(supabase, hive.logo_url);
    }
  }

  return {
    hiveId: hive.id,
    name: hive.name,
    logoUrl,
  };
}
