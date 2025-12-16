import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";

/**
 * DELETE /api/hives/[hiveId]/invites/[inviteId]
 * Revoke (delete) a pending invite (admin only)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ hiveId: string; inviteId: string }> }
) {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hiveId: hiveKey, inviteId } = await params;
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

  // Delete invite
  const { error } = await supabase
    .from("hive_invites")
    .delete()
    .eq("id", inviteId)
    .eq("hive_id", hiveId); // Ensure invite belongs to this hive

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Invite revoked" });
}
