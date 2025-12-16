import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { inviteEmailsSchema } from "@/lib/hives/data/hiveSchemas";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";

/**
 * POST /api/hives/[hiveId]/invite
 * Create invites for a hive (admin only)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hiveId: hiveKey } = await params;
  const body = await req.json().catch(() => null);

  // Validate input
  const validation = inviteEmailsSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { emails } = validation.data;
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

  // Create invite records
  const inviteRecords = emails.map((email) => ({
    hive_id: hiveId,
    email,
    status: "pending" as const,
  }));

  const { error } = await supabase.from("hive_invites").insert(inviteRecords);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // TODO: Send email invitations in production
  // For now, just return success

  return NextResponse.json({
    message: "Invites created",
    count: emails.length,
  });
}
