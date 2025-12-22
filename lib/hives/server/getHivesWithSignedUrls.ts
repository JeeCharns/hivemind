/**
 * Get Hives with Signed URLs
 *
 * Fetches user's hives and resolves logo storage paths to signed URLs
 * Follows SRP: single responsibility of preparing hive data for client
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserHives, type HiveRow } from "@/lib/navbar/data/hiveRepository";

export interface HiveWithSignedUrl extends Omit<HiveRow, "logo_url"> {
  logo_url: string | null; // This will be a signed URL or null
}

/**
 * Fetch user's hives and resolve logo URLs to signed URLs
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @returns Array of hives with signed logo URLs
 */
export async function getHivesWithSignedUrls(
  supabase: SupabaseClient,
  userId: string
): Promise<HiveWithSignedUrl[]> {
  // 1. Fetch hives with logo paths
  const hives = await getUserHives(supabase, userId);

  // 2. Resolve logo paths to signed URLs in parallel
  const hivesWithSignedUrls = await Promise.all(
    hives.map(async (hive) => {
      let signedLogoUrl: string | null = null;

      if (hive.logo_url) {
        try {
          // Generate signed URL for the logo
          const { data, error } = await supabase.storage
            .from("logos")
            .createSignedUrl(hive.logo_url, 3600); // 1 hour expiry

          if (!error && data?.signedUrl) {
            signedLogoUrl = data.signedUrl;
          } else {
            console.warn(`Failed to generate signed URL for hive ${hive.id}:`, error);
          }
        } catch (err) {
          console.error(`Error generating signed URL for hive ${hive.id}:`, err);
        }
      }

      return {
        ...hive,
        logo_url: signedLogoUrl,
      };
    })
  );

  return hivesWithSignedUrls;
}
