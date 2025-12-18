/**
 * uploadAvatar - Server Service
 *
 * Uploads user avatar to Supabase storage
 * Follows SRP: single responsibility of avatar upload
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { AVATAR_BUCKET } from "@/lib/storage/avatarBucket";
import { getAvatarUrl } from "@/lib/storage/server/getAvatarUrl";

export interface UploadAvatarResult {
  path: string; // Storage path (e.g., "userId/uuid.png")
  publicUrl: string; // Public URL to access the image
}

/**
 * Upload avatar image to storage
 *
 * @param supabase - Supabase client
 * @param userId - User UUID (used for folder organization)
 * @param file - File buffer
 * @param fileName - Original filename (for extension extraction)
 * @param contentType - MIME type of the file
 * @returns UploadAvatarResult with path and public URL
 * @throws Error if upload fails
 */
export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: Buffer,
  fileName: string,
  contentType: string
): Promise<UploadAvatarResult> {
  // Extract file extension from filename
  const extension = fileName.split(".").pop() || "png";

  // Generate unique filename to avoid conflicts
  const uniqueId = randomUUID();
  const storagePath = `${userId}/${uniqueId}.${extension}`;

  // List existing avatars; delete after a successful upload (avoid leaving user with none if upload fails)
  const { data: existingFiles } = await supabase.storage
    .from(AVATAR_BUCKET)
    .list(userId);

  // Upload new avatar
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(storagePath, file, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadAvatar] Upload error:", uploadError);
    throw new Error(`Failed to upload avatar: ${uploadError.message}`);
  }

  // Delete old avatars for this user to avoid storage bloat (keep the newly uploaded file)
  if (existingFiles && existingFiles.length > 0) {
    const filesToDelete = existingFiles
      .map((f) => `${userId}/${f.name}`)
      .filter((path) => path !== storagePath);
    if (filesToDelete.length > 0) {
      await supabase.storage.from(AVATAR_BUCKET).remove(filesToDelete);
    }
  }

  const avatarUrl = await getAvatarUrl(supabase, storagePath);

  return {
    path: storagePath,
    publicUrl: avatarUrl,
  };
}
