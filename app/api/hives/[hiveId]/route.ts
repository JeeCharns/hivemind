import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { updateHiveSchema } from "@/lib/hives/data/hiveSchemas";
import { jsonError } from "@/lib/api/errors";

/**
 * GET /api/hives/[hiveId]
 * Get a single hive by ID
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

  // Get hive
  const { data: hive, error } = await supabase
    .from("hives")
    .select("*")
    .eq("id", hiveId)
    .single();

  if (error || !hive) {
    return jsonError("Hive not found", 404);
  }

  return NextResponse.json(hive);
}

/**
 * PATCH /api/hives/[hiveId]
 * Update a hive (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  const session = await getServerSession();

  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const { hiveId } = await params;
  const body = await request.json().catch(() => null);

  // Validate input
  const validation = updateHiveSchema.safeParse(body);
  if (!validation.success) {
    return jsonError(
      validation.error.issues[0]?.message || "Invalid input",
      400
    );
  }

  const supabase = await supabaseServerClient();

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

  // Update hive
  const { data: hive, error } = await supabase
    .from("hives")
    .update(validation.data)
    .eq("id", hiveId)
    .select()
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  return NextResponse.json(hive);
}

/**
 * DELETE /api/hives/[hiveId]
 * Delete a hive and all related data (admin only)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  const session = await getServerSession();

  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const { hiveId } = await params;
  const supabase = await supabaseServerClient();

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

  try {
    // Gather related conversations so we can clean dependent rows first
    const { data: conversations, error: convErr } = await supabase
      .from("conversations")
      .select("id")
      .eq("hive_id", hiveId);

    if (convErr) throw convErr;

    const conversationIds = (conversations ?? []).map((c) => c.id);

    if (conversationIds.length) {
      // Delete dependent data in child tables
      await supabase
        .from("conversation_reports")
        .delete()
        .in("conversation_id", conversationIds);
      await supabase
        .from("conversation_themes")
        .delete()
        .in("conversation_id", conversationIds);
      await supabase
        .from("conversation_responses")
        .delete()
        .in("conversation_id", conversationIds);
    }

    // Delete conversations
    await supabase.from("conversations").delete().eq("hive_id", hiveId);

    // Delete hive memberships
    await supabase.from("hive_members").delete().eq("hive_id", hiveId);

    // Finally delete the hive record
    const { error: hiveErr } = await supabase
      .from("hives")
      .delete()
      .eq("id", hiveId);
    if (hiveErr) throw hiveErr;

    return NextResponse.json({ message: "Hive deleted" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete hive";
    return jsonError(message, 500);
  }
}
