import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";
import { jsonError } from "@/lib/api/errors";

/**
 * GET /api/hives/[hiveId]/invites
 * List all invites for a hive (admin only)
 */
export async function GET(
  request: Request,
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

    // Verify admin membership
    const { data: member } = await supabase
      .from("hive_members")
      .select("*")
      .eq("hive_id", hiveId)
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!member || member.role !== "admin") {
      return jsonError("Forbidden", 403);
    }

    // Get invites
    const { data: invites, error } = await supabase
      .from("hive_invites")
      .select("*")
      .eq("hive_id", hiveId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/hives/[hiveId]/invites] Error fetching invites:", error);
      return jsonError(error.message, 500);
    }

    return NextResponse.json(invites || []);
  } catch (error) {
    console.error("[GET /api/hives/[hiveId]/invites] Unexpected error:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
}
