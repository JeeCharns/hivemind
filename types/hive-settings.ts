/**
 * Hive Settings Types
 *
 * Domain types for hive settings operations
 * Follows SRP: types are separate from logic
 */

/**
 * View model for displaying hive settings
 */
export interface HiveSettingsViewModel {
  hiveId: string;
  name: string;
  logoUrl: string | null; // Signed URL or public URL, ready for display
}

/**
 * Input for updating hive name
 */
export interface UpdateHiveNameInput {
  name: string;
}

/**
 * Result from logo upload operation
 */
export interface UpdateHiveLogoResult {
  path: string;
  signedUrl: string | null;
}

/**
 * Generic action result for mutations
 */
export type SettingsActionResult =
  | { success: true; message?: string; redirectTo?: string }
  | { success: false; error: string };

/**
 * Image validation options
 */
export interface ImageValidationOptions {
  maxMb?: number;
  allowedTypes?: string[];
}
