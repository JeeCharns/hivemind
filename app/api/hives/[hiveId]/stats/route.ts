import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";

/**
 * GET /api/hives/[hiveId]/stats
 * Get statistics for a hive (conversation count, member count)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  const session = await getServerSession();

  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const { hiveId } = await params;
  const supabase = await supabaseServerClient();

  // Verify membership
  const { data: member } = await supabase
    .from("hive_members")
    .select("*")
    .eq("hive_id", hiveId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!member) {
    return jsonError("Forbidden", 403);
  }

  // Get stats in parallel
  const [conversationsResult, membersResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact" })
      .eq("hive_id", hiveId),
    supabase
      .from("hive_members")
      .select("user_id", { count: "exact" })
      .eq("hive_id", hiveId),
  ]);

  return NextResponse.json({
    conversationsCount: conversationsResult.count || 0,
    membersCount: membersResult.count || 0,
    lastActivity: null, // TODO: implement if needed
  });
}
