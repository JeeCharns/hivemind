/**
 * Hive Permissions Module
 *
 * Permission helpers for authorization checks
 * Used both in API routes (source of truth) and UI gating
 */

import type { Session } from "@/lib/auth/domain/session.types";
import type { HiveMember } from "./hive.types";

/**
 * Check if user can view hive content
 */
export function canViewHive(
  session: Session | null,
  members: HiveMember[]
): boolean {
  if (!session) return false;
  return members.some((m) => m.user_id === session.user.id);
}

/**
 * Check if user can manage hive settings (admin only)
 */
export function canManageHiveSettings(
  session: Session | null,
  members: HiveMember[]
): boolean {
  if (!session) return false;
  const member = members.find((m) => m.user_id === session.user.id);
  return member?.role === "admin";
}

/**
 * Check if user can invite members (admin only)
 */
export function canInviteMembers(
  session: Session | null,
  members: HiveMember[]
): boolean {
  return canManageHiveSettings(session, members);
}

/**
 * Check if user can delete hive (admin only)
 */
export function canDeleteHive(
  session: Session | null,
  members: HiveMember[]
): boolean {
  return canManageHiveSettings(session, members);
}
