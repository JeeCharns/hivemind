/**
 * getAvatarUrl - Storage helper (server-side)
 *
 * Prefer signed URLs (works for private buckets); fall back to public URLs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_BUCKET } from "@/lib/storage/avatarBucket";

export async function getAvatarUrl(
  supabase: SupabaseClient,
  avatarPath: string,
  expiresInSeconds = 60 * 60
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(avatarPath, expiresInSeconds);

  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath).data
    .publicUrl;
}
