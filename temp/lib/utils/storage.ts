import type { SupabaseClient } from "@supabase/supabase-js";

const signedCache = new Map<string, string>();

/**
 * Resolve a storage path to a usable URL.
 * - Returns the path as-is if it is already an http(s) URL.
 * - Signs the path for private buckets and caches the result for the lifetime of the module.
 */
export async function getSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string | null | undefined,
  expiresIn: number = 300
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  const cacheKey = `${bucket}:${path}`;
  if (signedCache.has(cacheKey)) {
    return signedCache.get(cacheKey)!;
  }

  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  const url = data?.signedUrl ?? null;
  if (url) signedCache.set(cacheKey, url);
  return url;
}
