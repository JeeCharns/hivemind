/**
 * Hive Resolver - Slug to ID Resolution
 *
 * Handles routing flexibility: accepts either slug or UUID
 * Following SRP: focused only on resolving hive identifiers
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve a hive key (slug or UUID) to a hive ID
 *
 * @param supabase - Supabase client
 * @param hiveKey - Either a slug or UUID
 * @returns The hive ID, or null if not found
 */
export async function resolveHiveId(
  supabase: SupabaseClient,
  hiveKey: string
): Promise<string | null> {
  // Check if it's already a valid UUID (36 chars with dashes)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(hiveKey)) {
    // It's a UUID, verify it exists
    const { data, error } = await supabase
      .from("hives")
      .select("id")
      .eq("id", hiveKey)
      .maybeSingle();

    if (error) {
      console.error(`[resolveHiveId] Error checking UUID ${hiveKey}:`, error);
      return null;
    }

    return data?.id || null;
  }

  // It's likely a slug, look it up
  const { data, error } = await supabase
    .from("hives")
    .select("id")
    .eq("slug", hiveKey)
    .maybeSingle();

  if (error) {
    console.error(`[resolveHiveId] Error resolving slug ${hiveKey}:`, error);
    return null;
  }

  return data?.id || null;
}

/**
 * Get hive slug by ID (for generating URLs)
 *
 * @param supabase - Supabase client
 * @param hiveId - Hive UUID
 * @returns The slug, or the ID if no slug exists
 */
export async function getHiveSlug(
  supabase: SupabaseClient,
  hiveId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("hives")
    .select("slug")
    .eq("id", hiveId)
    .maybeSingle();

  if (error || !data) {
    console.warn(`[getHiveSlug] Could not get slug for ${hiveId}, using ID`);
    return hiveId;
  }

  return data.slug || hiveId;
}
