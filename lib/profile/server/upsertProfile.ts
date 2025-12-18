/**
 * upsertProfile - Server Service
 *
 * Creates or updates user profile with display name and optional avatar
 * Follows SRP: single responsibility of profile upsert
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UpsertProfileResponse } from "@/types/profile-api";
import { uploadAvatar } from "./uploadAvatar";
import { getAvatarUrl } from "@/lib/storage/server/getAvatarUrl";

export interface UpsertProfileInput {
  displayName: string;
  avatarFile?: {
    buffer: Buffer;
    fileName: string;
    contentType: string;
  } | null;
}

/**
 * Upsert user profile
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @param input - Profile data (displayName + optional avatarFile)
 * @returns UpsertProfileResponse with id, displayName, and avatarUrl
 * @throws Error if upsert or upload fails
 */
export async function upsertProfile(
  supabase: SupabaseClient,
  userId: string,
  input: UpsertProfileInput
): Promise<UpsertProfileResponse> {
  let avatarPath: string | null = null;
  let avatarUrl: string | null = null;

  // 1. Upload avatar if provided
  if (input.avatarFile) {
    try {
      const uploadResult = await uploadAvatar(
        supabase,
        userId,
        input.avatarFile.buffer,
        input.avatarFile.fileName,
        input.avatarFile.contentType
      );
      avatarPath = uploadResult.path;
      avatarUrl = uploadResult.publicUrl;
    } catch (error) {
      console.error("[upsertProfile] Avatar upload failed:", error);
      throw new Error(
        `Avatar upload failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // 2. Upsert profile with display name (and avatar path if uploaded)
  const updateData: {
    display_name: string;
    avatar_path?: string;
  } = {
    display_name: input.displayName,
  };

  if (avatarPath) {
    updateData.avatar_path = avatarPath;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        ...updateData,
      },
      { onConflict: "id" }
    )
    .select("id, display_name, avatar_path")
    .single();

  if (error) {
    console.error("[upsertProfile] Upsert error:", error);
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  // 3. Get public URL for avatar if path exists
  if (profile.avatar_path && !avatarUrl) {
    avatarUrl = await getAvatarUrl(supabase, profile.avatar_path);
  }

  return {
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl,
  };
}
