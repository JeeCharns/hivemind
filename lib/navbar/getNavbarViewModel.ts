/**
 * Get Navbar View Model - Server-Side Logic
 *
 * Orchestrates data fetching and transformation for navbar
 * Follows SOLID principles:
 * - SRP: Single responsibility of building navbar view model
 * - DIP: Depends on abstractions (repository functions)
 * - Security: Server-side only, validates auth and membership
 */

import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import type { NavbarViewModel, NavbarPage } from "@/types/navbar";
import { getUserHives, getHiveById, checkHiveMembership } from "./data/hiveRepository";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";
import { redirect } from "next/navigation";
import { getAvatarUrl } from "@/lib/storage/server/getAvatarUrl";

interface GetNavbarViewModelParams {
  hiveKey?: string; // Can be slug or UUID
  currentPage?: NavbarPage;
}

/**
 * Build navbar view model with all required data
 *
 * Security:
 * - Requires valid session
 * - If hiveId provided, verifies user membership
 * - Redirects unauthorized users to appropriate pages
 *
 * @throws Error if database queries fail
 */
export async function getNavbarViewModel(
  params: GetNavbarViewModelParams = {}
): Promise<NavbarViewModel> {
  const { hiveKey, currentPage = "home" } = params;

  // 1. Verify authentication
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = await supabaseServerClient();

  // 2. Build user view model
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_path")
    .eq("id", session.user.id)
    .maybeSingle();

  const profileDisplayName = profile?.display_name?.trim?.() || null;
  const displayName =
    profileDisplayName ||
    session.user.name ||
    session.user.email.split("@")[0] ||
    "User";

  const avatarPath = profile?.avatar_path ?? null;
  const avatarUrl = avatarPath ? await getAvatarUrl(supabase, avatarPath) : null;

  const user = {
    displayName,
    email: session.user.email,
    avatarUrl,
  };

  // 3. Fetch user's hives
  let hives: Awaited<ReturnType<typeof getUserHives>> = [];
  try {
    hives = await getUserHives(supabase, session.user.id);
  } catch (error) {
    console.error("[getNavbarViewModel] Failed to fetch hives:", error);
    hives = [];
  }

  // 4. If hiveKey provided, resolve to ID and fetch current hive
  let currentHive = null;
  if (hiveKey) {
    try {
      // Resolve slug or UUID to hive ID
      const hiveId = await resolveHiveId(supabase, hiveKey);
      if (!hiveId) {
        console.warn(`[getNavbarViewModel] Hive not found: ${hiveKey}`);
        redirect("/hives");
      }

      // Check membership first (security)
      const isMember = await checkHiveMembership(supabase, session.user.id, hiveId);
      if (!isMember) {
        console.warn(`[getNavbarViewModel] User ${session.user.id} not member of hive ${hiveId}`);
        redirect("/hives");
      }

      // Fetch hive details
      const hive = await getHiveById(supabase, hiveId);
      if (!hive) {
        console.warn(`[getNavbarViewModel] Hive ${hiveId} not found`);
        redirect("/hives");
      }

      currentHive = {
        id: hive.id,
        slug: hive.slug,
        name: hive.name,
        logoUrl: hive.logo_url,
      };
    } catch (error) {
      console.error("[getNavbarViewModel] Error fetching current hive:", error);
      redirect("/hives");
    }
  }

  // 5. Transform hives to options
  const hiveOptions = hives.map((hive) => ({
    id: hive.id,
    slug: hive.slug,
    name: hive.name,
  }));

  return {
    user,
    hives: hiveOptions,
    currentHive,
    currentPage,
  };
}
