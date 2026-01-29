/**
 * Hive Repository - Data Access Layer
 *
 * Abstracts database queries for navbar functionality
 * Follows SRP: focused only on data fetching
 * Supports testability through dependency injection
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface HiveRow {
  id: string;
  slug: string | null;
  name: string;
  logo_url: string | null;
}

export interface MembershipRow {
  hive_id: string;
  role: string;
}

/**
 * Fetch all hives where user is a member
 */
export async function getUserHives(
  supabase: SupabaseClient,
  userId: string
): Promise<HiveRow[]> {
  const { data: memberships, error: memberError } = await supabase
    .from("hive_members")
    .select("hive_id")
    .eq("user_id", userId);

  if (memberError) {
    throw new Error(`Failed to fetch user memberships: ${memberError.message}`);
  }

  if (!memberships || memberships.length === 0) {
    return [];
  }

  const hiveIds = memberships.map((m) => m.hive_id);

  const { data: hives, error: hiveError } = await supabase
    .from("hives")
    .select("id, slug, name, logo_url")
    .in("id", hiveIds)
    .order("name", { ascending: true });

  if (hiveError) {
    throw new Error(`Failed to fetch hives: ${hiveError.message}`);
  }

  return (hives as HiveRow[]) || [];
}

/**
 * Fetch a single hive by ID
 */
export async function getHiveById(
  supabase: SupabaseClient,
  hiveId: string
): Promise<HiveRow | null> {
  const { data: hive, error } = await supabase
    .from("hives")
    .select("id, slug, name, logo_url")
    .eq("id", hiveId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch hive: ${error.message}`);
  }

  return hive as HiveRow | null;
}

/**
 * Check if user is a member of a hive
 */
export async function checkHiveMembership(
  supabase: SupabaseClient,
  userId: string,
  hiveId: string
): Promise<boolean> {
  const { data: membership, error } = await supabase
    .from("hive_members")
    .select("hive_id")
    .eq("user_id", userId)
    .eq("hive_id", hiveId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check membership: ${error.message}`);
  }

  return !!membership;
}

/**
 * Check if user is a member and return their role
 */
export async function getHiveMemberRole(
  supabase: SupabaseClient,
  userId: string,
  hiveId: string
): Promise<{ isMember: boolean; role: string | null }> {
  const { data: membership, error } = await supabase
    .from("hive_members")
    .select("role")
    .eq("user_id", userId)
    .eq("hive_id", hiveId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check membership: ${error.message}`);
  }

  return {
    isMember: !!membership,
    role: membership?.role ?? null,
  };
}
