import type { SupabaseClient } from "@supabase/supabase-js";

export interface EnsureProfileUser {
  id: string;
  email?: string;
}

function deriveDisplayName(email?: string): string {
  const trimmed = (email ?? "").trim().toLowerCase();
  if (!trimmed) return "User";
  const at = trimmed.indexOf("@");
  const localPart = at > 0 ? trimmed.slice(0, at) : trimmed;
  if (!localPart) return "User";
  return localPart.slice(0, 32);
}

export async function ensureProfileExists(
  supabase: SupabaseClient,
  user: EnsureProfileUser
): Promise<void> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[ensureProfileExists] Query error:", error);
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  if (profile) return;

  const displayName = deriveDisplayName(user.email);

  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    display_name: displayName,
  });

  if (insertError) {
    console.error("[ensureProfileExists] Insert error:", insertError);
    throw new Error(`Failed to initialize profile: ${insertError.message}`);
  }
}
