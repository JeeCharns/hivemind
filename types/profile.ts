/**
 * Profile Domain Types
 *
 * Shared profile shape used across the application
 */

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
}

export interface ProfileWithUrl extends Profile {
  avatar_url: string | null; // Signed or public URL
}
