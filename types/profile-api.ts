/**
 * Profile API Types
 *
 * Request/response types for profile-related API endpoints
 */

export interface ProfileStatusResponse {
  hasProfile: boolean;
  needsSetup: boolean; // true when display_name missing/empty
}

export interface UpsertProfileResponse {
  id: string;
  displayName: string;
  avatarUrl: string | null; // signed/public URL
}
