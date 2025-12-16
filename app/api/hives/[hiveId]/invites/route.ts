import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { hiveId: hiveKey } = await params;
    const supabase = await supabaseServerClient();

    const hiveId = await resolveHiveId(supabase, hiveKey);
    if (!hiveId) {
      return NextResponse.json({ error: "Hive not found" }, { status: 404 });
    }

    // Verify admin membership
    const { data: member } = await supabase
      .from("hive_members")
      .select("*")
      .eq("hive_id", hiveId)
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!member || member.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get invites
    const { data: invites, error } = await supabase
      .from("hive_invites")
      .select("*")
      .eq("hive_id", hiveId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/hives/[hiveId]/invites] Error fetching invites:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(invites || []);
  } catch (error) {
    console.error("[GET /api/hives/[hiveId]/invites] Unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
