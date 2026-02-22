/**
 * Member Management Server Actions
 *
 * Server-side mutations for managing hive members
 * Follows SOLID principles and security best practices
 */

"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import type { HiveMemberRole, MemberActionResult } from "@/types/members";
import { isValidRole } from "@/lib/members/validation/memberValidation";
import { getMembersWithSignedUrls } from "@/lib/members/server/getMembersWithSignedUrls";
import {
  canRemoveMember,
  canChangeRole,
} from "@/lib/members/validation/memberValidation";

/**
 * Check if user is an admin of the hive
 */
async function isHiveAdmin(
  supabase: Awaited<ReturnType<typeof supabaseServerClient>>,
  hiveId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", hiveId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return false;
  return data.role === "admin";
}

/**
 * Change a member's role
 *
 * Security:
 * - Requires requester to be an admin
 * - Validates role is valid enum value
 * - Prevents demoting the last admin
 *
 * @param hiveId - Hive UUID
 * @param userId - User UUID to change
 * @param newRole - New role to assign
 */
export async function changeMemberRoleAction(
  hiveId: string,
  userId: string,
  newRole: HiveMemberRole
): Promise<MemberActionResult> {
  try {
    // 1. Validate inputs
    if (!hiveId || !userId) {
      return { success: false, error: "Invalid input: missing IDs" };
    }

    if (!isValidRole(newRole)) {
      return { success: false, error: "Invalid role" };
    }

    // 2. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: "Unauthorized: Not authenticated" };
    }

    const supabase = await supabaseServerClient();

    // 3. Verify requester is an admin
    const isAdmin = await isHiveAdmin(supabase, hiveId, session.user.id);
    if (!isAdmin) {
      return { success: false, error: "Unauthorized: Admin access required" };
    }

    // 4. Fetch current members to validate the change
    const members = await getMembersWithSignedUrls(
      supabase,
      hiveId,
      session.user.id
    );
    const validation = canChangeRole(members, userId, newRole);

    if (!validation.canChange) {
      return {
        success: false,
        error: validation.reason || "Cannot change role",
      };
    }

    // 5. Update the role
    const { error: updateError } = await supabase
      .from("hive_members")
      .update({ role: newRole })
      .eq("hive_id", hiveId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("[changeMemberRoleAction] Update failed:", updateError);
      return { success: false, error: "Failed to update role" };
    }

    // 6. Revalidate the page to show updated data
    revalidatePath(`/hives/${hiveId}/members`);

    return { success: true };
  } catch (error) {
    console.error("[changeMemberRoleAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to change role",
    };
  }
}

/**
 * Remove a member from the hive
 *
 * Security:
 * - Requires requester to be an admin
 * - Prevents removing the last admin
 *
 * @param hiveId - Hive UUID
 * @param userId - User UUID to remove
 */
export async function removeMemberAction(
  hiveId: string,
  userId: string
): Promise<MemberActionResult> {
  try {
    // 1. Validate inputs
    if (!hiveId || !userId) {
      return { success: false, error: "Invalid input: missing IDs" };
    }

    // 2. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: "Unauthorized: Not authenticated" };
    }

    const supabase = await supabaseServerClient();

    // 3. Verify requester is an admin
    const isAdmin = await isHiveAdmin(supabase, hiveId, session.user.id);
    if (!isAdmin) {
      return { success: false, error: "Unauthorized: Admin access required" };
    }

    // 4. Fetch current members to validate the removal
    const members = await getMembersWithSignedUrls(
      supabase,
      hiveId,
      session.user.id
    );
    const validation = canRemoveMember(members, userId);

    if (!validation.canRemove) {
      return {
        success: false,
        error: validation.reason || "Cannot remove member",
      };
    }

    // 5. Remove the member
    const { error: deleteError } = await supabase
      .from("hive_members")
      .delete()
      .eq("hive_id", hiveId)
      .eq("user_id", userId);

    if (deleteError) {
      console.error("[removeMemberAction] Delete failed:", deleteError);
      return { success: false, error: "Failed to remove member" };
    }

    // 6. Revalidate the page to show updated data
    revalidatePath(`/hives/${hiveId}/members`);

    return { success: true };
  } catch (error) {
    console.error("[removeMemberAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove member",
    };
  }
}

/**
 * Leave a hive (self-removal)
 *
 * Security:
 * - User must be authenticated
 * - User must be a member of the hive
 * - Prevents last admin from leaving
 *
 * @param hiveId - Hive UUID
 */
export async function leaveHiveAction(
  hiveId: string
): Promise<MemberActionResult> {
  try {
    // 1. Validate inputs
    if (!hiveId) {
      return { success: false, error: "Invalid input: missing hive ID" };
    }

    // 2. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: "Unauthorized: Not authenticated" };
    }

    const supabase = await supabaseServerClient();
    const userId = session.user.id;

    // 3. Fetch current members to validate the removal
    const members = await getMembersWithSignedUrls(supabase, hiveId, userId);

    // Check if user is actually a member
    const isMember = members.some((m) => m.userId === userId);
    if (!isMember) {
      return { success: false, error: "You are not a member of this hive" };
    }

    // 4. Validate removal (prevents last admin from leaving)
    const validation = canRemoveMember(members, userId);

    if (!validation.canRemove) {
      return {
        success: false,
        error: validation.reason || "Cannot leave hive",
      };
    }

    // 5. Remove the member
    const { error: deleteError } = await supabase
      .from("hive_members")
      .delete()
      .eq("hive_id", hiveId)
      .eq("user_id", userId);

    if (deleteError) {
      console.error("[leaveHiveAction] Delete failed:", deleteError);
      return { success: false, error: "Failed to leave hive" };
    }

    // 6. Revalidate the page
    revalidatePath(`/hives/${hiveId}/members`);
    revalidatePath(`/hives`);

    return { success: true };
  } catch (error) {
    console.error("[leaveHiveAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to leave hive",
    };
  }
}
