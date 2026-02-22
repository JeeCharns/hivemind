import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";
import { jsonError } from "@/lib/api/errors";
import {
  getOrCreateShareLink,
  updateShareLinkAccessMode,
} from "@/lib/hives/server/shareLinkService";
import { updateShareLinkAccessModeSchema } from "@/lib/hives/schemas";

/**
 * GET /api/hives/[hiveId]/share-link
 * Get or create a share link for a hive (requires membership)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized", 401);
    }

    const { hiveId: hiveKey } = await params;
    const supabase = await supabaseServerClient();

    const hiveId = await resolveHiveId(supabase, hiveKey);
    if (!hiveId) {
      return jsonError("Hive not found", 404);
    }

    // Verify user is a member of the hive
    const { data: member } = await supabase
      .from("hive_members")
      .select("*")
      .eq("hive_id", hiveId)
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!member) {
      return jsonError("Forbidden", 403);
    }

    // Get or create share link
    const shareLink = await getOrCreateShareLink(
      supabase,
      hiveId,
      session.user.id
    );

    console.log(
      "[GET /api/hives/[hiveId]/share-link] Created/Retrieved share link:",
      {
        token: shareLink.token,
        hiveId: shareLink.hive_id,
        accessMode: shareLink.access_mode,
      }
    );

    // Get hive name for convenience
    const { data: hive } = await supabase
      .from("hives")
      .select("name")
      .eq("id", hiveId)
      .single();

    // Build invite URL
    const baseUrl = request.nextUrl.origin;
    const inviteUrl = `${baseUrl}/invite/${shareLink.token}`;

    console.log(
      "[GET /api/hives/[hiveId]/share-link] Returning URL:",
      inviteUrl
    );

    return NextResponse.json({
      url: inviteUrl,
      accessMode: shareLink.access_mode,
      hiveName: hive?.name ?? "Hive",
    });
  } catch (error) {
    console.error("[GET /api/hives/[hiveId]/share-link] Error:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
}

/**
 * PATCH /api/hives/[hiveId]/share-link
 * Update the access mode of a share link (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized", 401);
    }

    const { hiveId: hiveKey } = await params;
    const supabase = await supabaseServerClient();

    const hiveId = await resolveHiveId(supabase, hiveKey);
    if (!hiveId) {
      return jsonError("Hive not found", 404);
    }

    // Verify user is an admin of the hive
    const { data: member } = await supabase
      .from("hive_members")
      .select("*")
      .eq("hive_id", hiveId)
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!member || member.role !== "admin") {
      return jsonError("Forbidden: Admin access required", 403);
    }

    // Parse and validate request body
    const body = await request.json().catch(() => null);
    const parsed = updateShareLinkAccessModeSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues?.[0];
      return jsonError(
        firstError?.message ?? "Invalid input",
        400,
        "VALIDATION_ERROR"
      );
    }

    // Update access mode
    const updatedLink = await updateShareLinkAccessMode(
      supabase,
      hiveId,
      parsed.data.accessMode
    );

    return NextResponse.json({
      accessMode: updatedLink.access_mode,
    });
  } catch (error) {
    console.error("[PATCH /api/hives/[hiveId]/share-link] Error:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
}
