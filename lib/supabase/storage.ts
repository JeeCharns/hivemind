import { supabase } from "./client";

// Cache for signed URLs to avoid regenerating them
const signedUrlCache = new Map<string, { url: string; expires: number }>();

/**
 * Get a signed URL for a file in a private Supabase Storage bucket
 * Uses caching to avoid regenerating URLs unnecessarily
 *
 * @param bucket - The storage bucket name (e.g., "logos")
 * @param path - The file path within the bucket
 * @param expiresIn - How long the URL should be valid (in seconds), default 1 hour
 * @returns Promise resolving to the signed URL
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
): Promise<string> {
  const cacheKey = `${bucket}:${path}`;
  const cached = signedUrlCache.get(cacheKey);

  // Return cached URL if it exists and hasn't expired (with 5 minute buffer)
  if (cached && cached.expires > Date.now() + 300000) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error(`Failed to create signed URL for ${bucket}/${path}:`, error);
    throw error;
  }

  if (!data?.signedUrl) {
    throw new Error(`No signed URL returned for ${bucket}/${path}`);
  }

  // Cache the URL with expiry time
  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expires: Date.now() + expiresIn * 1000,
  });

  return data.signedUrl;
}

/**
 * Convert a logo_url path to a signed URL
 * If the path is already a full URL, return it as-is
 *
 * NOTE: This function is async because it needs to create signed URLs for private buckets
 *
 * @param logoUrl - The logo_url value from the database (may be null, a path, or a full URL)
 * @returns Promise resolving to the signed URL or null if logoUrl is null
 */
export async function getLogoSignedUrl(
  logoUrl: string | null
): Promise<string | null> {
  if (!logoUrl) return null;

  // If it's already a full URL (http:// or https://), return as-is
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
    return logoUrl;
  }

  // Otherwise, treat it as a storage path in the "logos" bucket
  try {
    return await getSignedUrl("logos", logoUrl);
  } catch (error) {
    console.error("Failed to get signed URL for logo:", error);
    return null;
  }
}
