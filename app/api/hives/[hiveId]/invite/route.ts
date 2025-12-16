import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { inviteEmailsSchema } from "@/lib/hives/data/hiveSchemas";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";
import { jsonError } from "@/lib/api/errors";

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
    return jsonError("Unauthorized", 401);
  }

  const { hiveId: hiveKey } = await params;
  const body = await req.json().catch(() => null);

  // Validate input
  const validation = inviteEmailsSchema.safeParse(body);
  if (!validation.success) {
    return jsonError(
      validation.error.issues[0]?.message || "Invalid input",
      400
    );
  }

  const { emails } = validation.data;
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

  // Create invite records
  const inviteRecords = emails.map((email) => ({
    hive_id: hiveId,
    email,
    status: "pending" as const,
  }));

  const { error } = await supabase.from("hive_invites").insert(inviteRecords);

  if (error) {
    return jsonError(error.message, 500);
  }

  // TODO: Send email invitations in production
  // For now, just return success

  return NextResponse.json({
    message: "Invites created",
    count: emails.length,
  });
}
