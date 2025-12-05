import { SupabaseClient } from "@supabase/supabase-js";

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  avatarPath: string | null;
};

/**
 * Resolve the current user from Supabase auth plus profile.
 * Returns null when unauthenticated.
 */
export async function getCurrentUserProfile(
  supabase: SupabaseClient
): Promise<CurrentUser | null> {
  const { data: auth } = await supabase.auth.getUser();
  const authUser = auth.user;
  if (!authUser?.id || !authUser.email) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,avatar_path")
    .eq("id", authUser.id)
    .maybeSingle();

  return {
    id: authUser.id,
    email: authUser.email,
    displayName: profile?.display_name ?? authUser.email,
    avatarPath: profile?.avatar_path ?? null,
  };
}
