/**
 * Avatar Bucket Configuration
 *
 * Single source of truth for avatar storage bucket name
 * Resolves from environment variables with fallback to default
 */

/**
 * Get the avatar storage bucket name
 *
 * Priority:
 * 1. SUPABASE_AVATAR_BUCKET (server-side)
 * 2. NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET (client-side)
 * 3. Default: "user-avatars"
 *
 * @returns The bucket name to use for avatar storage
 */
export function getAvatarBucket(): string {
  return (
    process.env.SUPABASE_AVATAR_BUCKET ||
    process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET ||
    "user-avatars"
  );
}

/**
 * Default avatar bucket name
 * Use getAvatarBucket() for runtime resolution with env var support
 */
export const AVATAR_BUCKET = getAvatarBucket();
