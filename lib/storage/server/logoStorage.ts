/**
 * Logo Storage Service - Server-Side Only
 *
 * Handles logo upload, deletion, and signed URL generation
 * Follows SRP: single responsibility of logo storage operations
 * Security: Only runs server-side with proper authentication
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UpdateHiveLogoResult } from "@/types/hive-settings";

const BUCKET_NAME = "logos";
const SIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Upload a new logo file and optionally delete the old one
 *
 * @param supabase - Supabase client
 * @param file - File to upload
 * @param pathPrefix - Prefix for the file path (typically userId or hiveId)
 * @param previousPath - Previous logo path to delete (optional)
 * @returns Upload result with path and signed URL
 */
export async function uploadLogo(
  supabase: SupabaseClient,
  file: File,
  pathPrefix: string,
  previousPath?: string | null
): Promise<UpdateHiveLogoResult> {
  // Generate unique file path
  const ext = file.name.split(".").pop();
  const path = `${pathPrefix}/${Date.now()}.${ext}`;

  // Upload the file
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file, { upsert: true });

  if (uploadErr) {
    throw new Error(`Failed to upload logo: ${uploadErr.message}`);
  }

  // Delete old logo if exists (fire-and-forget, don't fail on error)
  if (previousPath && previousPath !== path) {
    await supabase.storage
      .from(BUCKET_NAME)
      .remove([previousPath])
      .catch((err) => {
        console.warn(`[logoStorage] Failed to delete old logo ${previousPath}:`, err);
      });
  }

  // Generate signed URL
  const signedUrl = await getLogoSignedUrl(supabase, path);

  return { path, signedUrl };
}

/**
 * Get a signed URL for a logo path
 *
 * @param supabase - Supabase client
 * @param path - Logo path in storage
 * @returns Signed URL or null if failed
 */
export async function getLogoSignedUrl(
  supabase: SupabaseClient,
  path: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, SIGNED_URL_EXPIRY);

    if (error || !data?.signedUrl) {
      console.warn(`[logoStorage] Failed to create signed URL for ${path}:`, error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.warn(`[logoStorage] Error creating signed URL for ${path}:`, err);
    return null;
  }
}

/**
 * Delete a logo from storage
 *
 * @param supabase - Supabase client
 * @param path - Logo path to delete
 */
export async function deleteLogo(
  supabase: SupabaseClient,
  path: string
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);

  if (error) {
    console.warn(`[logoStorage] Failed to delete logo ${path}:`, error);
    // Don't throw - deletion is best-effort
  }
}
