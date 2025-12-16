/**
 * Member Validation Logic
 *
 * Pure functions for validating member operations
 * Follows SRP: single responsibility of validation
 * Unit-testable: no side effects, deterministic
 */

import type { HiveMemberRole, MemberViewModel } from "@/types/members";

/**
 * Check if a role string is valid
 */
export function isValidRole(role: string): role is HiveMemberRole {
  return role === "admin" || role === "member";
}

/**
 * Check if a member can be removed without leaving the hive without admins
 *
 * Business rule: Cannot remove the last admin
 *
 * @param members - Current list of members
 * @param userIdToRemove - ID of user to remove
 * @returns { canRemove: boolean; reason?: string }
 */
export function canRemoveMember(
  members: MemberViewModel[],
  userIdToRemove: string
): { canRemove: boolean; reason?: string } {
  const memberToRemove = members.find((m) => m.userId === userIdToRemove);

  if (!memberToRemove) {
    return { canRemove: false, reason: "Member not found" };
  }

  // If not an admin, can always remove
  if (memberToRemove.role !== "admin") {
    return { canRemove: true };
  }

  // If admin, check if they're the last one
  const adminCount = members.filter((m) => m.role === "admin").length;

  if (adminCount <= 1) {
    return {
      canRemove: false,
      reason: "Cannot remove the only admin. Promote another member to admin first.",
    };
  }

  return { canRemove: true };
}

/**
 * Check if a role change would leave the hive without admins
 *
 * Business rule: Cannot demote the last admin
 *
 * @param members - Current list of members
 * @param userIdToChange - ID of user to change
 * @param newRole - New role to assign
 * @returns { canChange: boolean; reason?: string }
 */
export function canChangeRole(
  members: MemberViewModel[],
  userIdToChange: string,
  newRole: HiveMemberRole
): { canChange: boolean; reason?: string } {
  const memberToChange = members.find((m) => m.userId === userIdToChange);

  if (!memberToChange) {
    return { canChange: false, reason: "Member not found" };
  }

  // If not changing from admin to member, allow
  if (memberToChange.role !== "admin" || newRole === "admin") {
    return { canChange: true };
  }

  // Demoting an admin to member - check if they're the last admin
  const adminCount = members.filter((m) => m.role === "admin").length;

  if (adminCount <= 1) {
    return {
      canChange: false,
      reason: "Cannot demote the only admin. Promote another member to admin first.",
    };
  }

  return { canChange: true };
}
