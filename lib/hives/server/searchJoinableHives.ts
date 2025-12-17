/**
 * searchJoinableHives - Server Service
 *
 * Searches for hives by name and returns results with membership status
 * Follows SRP: single responsibility of searching hives
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface HiveSearchResult {
  id: string;
  name: string | null;
  slug: string | null;
  alreadyMember: boolean;
}

export interface SearchJoinableHivesOptions {
  term: string;
  limit?: number;
}

/**
 * Search for hives by name and return with membership status
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @param options - Search options (term, limit)
 * @returns Array of hive search results with alreadyMember flag
 */
export async function searchJoinableHives(
  supabase: SupabaseClient,
  userId: string,
  options: SearchJoinableHivesOptions
): Promise<HiveSearchResult[]> {
  const { term, limit = 5 } = options;

  // 1. Search hives by name (case-insensitive partial match)
  const { data: hives, error: hivesError } = await supabase
    .from("hives")
    .select("id, name, slug")
    .ilike("name", `%${term}%`)
    .limit(limit);

  if (hivesError) {
    console.error("[searchJoinableHives] Query error:", hivesError);
    throw new Error(`Failed to search hives: ${hivesError.message}`);
  }

  if (!hives || hives.length === 0) {
    return [];
  }

  // 2. Fetch user's memberships for these hives (avoid N+1)
  const hiveIds = hives.map((h) => h.id);
  const { data: memberships, error: membershipsError } = await supabase
    .from("hive_members")
    .select("hive_id")
    .eq("user_id", userId)
    .in("hive_id", hiveIds);

  if (membershipsError) {
    console.error("[searchJoinableHives] Memberships error:", membershipsError);
    throw new Error(`Failed to check memberships: ${membershipsError.message}`);
  }

  // 3. Build membership set for O(1) lookup
  const membershipSet = new Set(memberships?.map((m) => m.hive_id) ?? []);

  // 4. Map results with alreadyMember flag
  return hives.map((hive) => ({
    id: hive.id,
    name: hive.name,
    slug: hive.slug,
    alreadyMember: membershipSet.has(hive.id),
  }));
}
