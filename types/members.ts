/**
 * Member Types
 *
 * Domain types for hive members
 * Follows SRP: types are separate from logic
 */

export type HiveMemberRole = "admin" | "member";

/**
 * View model for displaying a member in the UI
 * Contains all data needed for presentation (including signed avatar URL)
 */
export interface MemberViewModel {
  userId: string;
  displayName: string;
  email?: string;
  avatarUrl: string | null; // Signed URL ready for display
  role: HiveMemberRole;
}

/**
 * Result type for server actions
 */
export type MemberActionResult =
  | { success: true }
  | { success: false; error: string };
