/**
 * Hive Settings Server Actions
 *
 * Server-side mutations for managing hive settings
 * Follows SOLID principles and security best practices
 */

"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
import { uploadLogo } from "@/lib/storage/server/logoStorage";
import { validateImageFile } from "@/lib/storage/validation";
import type { SettingsActionResult } from "@/types/hive-settings";
import { hiveVisibilitySchema } from "@/lib/hives/schemas";

/**
 * Update hive name
 *
 * Security:
 * - Requires requester to be an admin
 * - Validates name is not empty
 *
 * @param hiveId - Hive UUID
 * @param formData - Form data containing name
 */
export async function updateHiveNameAction(
  hiveId: string,
  formData: FormData
): Promise<SettingsActionResult> {
  try {
    // 1. Validate inputs
    const name = formData.get("name");
    if (!hiveId) {
      return { success: false, error: "Invalid input: missing hive ID" };
    }

    if (typeof name !== "string" || !name.trim()) {
      return { success: false, error: "Name cannot be empty" };
    }

    // 2. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: "Unauthorized: Not authenticated" };
    }

    const supabase = await supabaseServerClient();

    // 3. Verify requester is an admin
    await requireHiveAdmin(supabase, session.user.id, hiveId);

    // 4. Update the name
    const { error: updateError } = await supabase
      .from("hives")
      .update({ name: name.trim() })
      .eq("id", hiveId);

    if (updateError) {
      console.error("[updateHiveNameAction] Update failed:", updateError);
      return { success: false, error: "Failed to update name" };
    }

    // 5. Revalidate the page to show updated data
    revalidatePath(`/hives/${hiveId}/settings`);

    return { success: true, message: "Name updated." };
  } catch (error) {
    console.error("[updateHiveNameAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update name",
    };
  }
}

/**
 * Update hive logo
 *
 * Security:
 * - Requires requester to be an admin
 * - Validates file type and size
 * - Handles file upload and old file deletion server-side
 *
 * @param hiveId - Hive UUID
 * @param formData - Form data containing logo file
 */
export async function updateHiveLogoAction(
  hiveId: string,
  formData: FormData
): Promise<SettingsActionResult> {
  try {
    // 1. Validate inputs
    if (!hiveId) {
      return { success: false, error: "Invalid input: missing hive ID" };
    }

    const file = formData.get("logo") as File | null;
    if (!file || !(file instanceof File)) {
      return { success: false, error: "No file provided" };
    }

    // 2. Validate file
    const validationError = validateImageFile(file, { maxMb: 2 });
    if (validationError) {
      return { success: false, error: validationError };
    }

    // 3. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: "Unauthorized: Not authenticated" };
    }

    const supabase = await supabaseServerClient();

    // 4. Verify requester is an admin
    await requireHiveAdmin(supabase, session.user.id, hiveId);

    // 5. Get current logo path
    const { data: currentHive } = await supabase
      .from("hives")
      .select("logo_url")
      .eq("id", hiveId)
      .maybeSingle();

    const previousPath = currentHive?.logo_url || null;

    // 6. Upload new logo (and delete old one)
    const { path } = await uploadLogo(supabase, file, hiveId, previousPath);

    // 7. Update database with new logo path
    const { error: updateError } = await supabase
      .from("hives")
      .update({ logo_url: path })
      .eq("id", hiveId);

    if (updateError) {
      console.error("[updateHiveLogoAction] Update failed:", updateError);
      return { success: false, error: "Failed to update logo" };
    }

    // 8. Revalidate the page to show updated data
    revalidatePath(`/hives/${hiveId}/settings`);

    return { success: true, message: "Logo updated." };
  } catch (error) {
    console.error("[updateHiveLogoAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update logo",
    };
  }
}

/**
 * Update hive visibility
 *
 * Security:
 * - Requires requester to be an admin
 * - Validates visibility is valid enum value
 *
 * @param hiveId - Hive UUID
 * @param visibility - New visibility value ("public" | "private")
 */
export async function updateHiveVisibilityAction(
  hiveId: string,
  visibility: string
): Promise<SettingsActionResult> {
  try {
    // 1. Validate inputs
    if (!hiveId) {
      return { success: false, error: "Invalid input: missing hive ID" };
    }

    const parsed = hiveVisibilitySchema.safeParse(visibility);
    if (!parsed.success) {
      return { success: false, error: "Invalid visibility value" };
    }

    // 2. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: "Unauthorized: Not authenticated" };
    }

    const supabase = await supabaseServerClient();

    // 3. Verify requester is an admin
    await requireHiveAdmin(supabase, session.user.id, hiveId);

    // 4. Update the visibility
    const { error: updateError } = await supabase
      .from("hives")
      .update({ visibility: parsed.data })
      .eq("id", hiveId);

    if (updateError) {
      console.error("[updateHiveVisibilityAction] Update failed:", updateError);
      return { success: false, error: "Failed to update visibility" };
    }

    // 5. Revalidate the page to show updated data
    revalidatePath(`/hives/${hiveId}/settings`);

    return { success: true, message: "Visibility updated." };
  } catch (error) {
    console.error("[updateHiveVisibilityAction] Error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update visibility",
    };
  }
}

/**
 * Delete hive
 *
 * Security:
 * - Requires requester to be an admin
 * - Cascades deletion (logo, members, conversations, etc.)
 * - Returns redirect URL based on remaining memberships
 *
 * @param hiveId - Hive UUID
 */
export async function deleteHiveAction(
  hiveId: string
): Promise<SettingsActionResult> {
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

    // 3. Verify requester is an admin
    await requireHiveAdmin(supabase, session.user.id, hiveId);

    // 4. Get logo path before deletion (for cleanup)
    const { data: hive } = await supabase
      .from("hives")
      .select("logo_url")
      .eq("id", hiveId)
      .maybeSingle();

    // 5. Delete hive (cascades via DB constraints)
    // Note: conversations, responses, hive_members should cascade via foreign keys
    const { error: deleteError } = await supabase
      .from("hives")
      .delete()
      .eq("id", hiveId);

    if (deleteError) {
      console.error("[deleteHiveAction] Delete failed:", deleteError);
      return { success: false, error: "Failed to delete hive" };
    }

    // 6. Clean up logo from storage (best-effort, don't fail if it errors)
    if (hive?.logo_url && !hive.logo_url.startsWith("http")) {
      await supabase.storage
        .from("logos")
        .remove([hive.logo_url])
        .catch((err) => {
          console.warn("[deleteHiveAction] Failed to delete logo:", err);
        });
    }

    // 7. Determine redirect based on remaining memberships
    const { data: remainingMemberships } = await supabase
      .from("hive_members")
      .select("hive_id")
      .eq("user_id", session.user.id);

    let redirectTo = "/hives";

    if (remainingMemberships && remainingMemberships.length === 1) {
      // User has exactly one hive left, redirect to it
      redirectTo = `/hives/${remainingMemberships[0].hive_id}`;
    }

    return {
      success: true,
      message: "Hive deleted successfully",
      redirectTo,
    };
  } catch (error) {
    console.error("[deleteHiveAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete hive",
    };
  }
}
