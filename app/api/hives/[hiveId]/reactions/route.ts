/**
 * POST /api/hives/[hiveId]/reactions
 *
 * Adds a reaction (emoji + optional message) to a hive.
 * Used by the social sidebar for real-time emoji wall.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { addReaction } from "@/lib/social/server/reactionsService";
import { jsonError } from "@/lib/api/errors";

const addReactionSchema = z.object({
  emoji: z.enum(["👋", "🎉", "💡", "❤️", "🐝"]),
  message: z.string().max(50).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  // 1. Authenticate
  const session = await getServerSession();
  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const { hiveId } = await params;
  const supabase = await supabaseServerClient();

  // 2. Verify membership
  const { data: member } = await supabase
    .from("hive_members")
    .select("id")
    .eq("hive_id", hiveId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!member) {
    return jsonError("Forbidden", 403);
  }

  // 3. Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const validation = addReactionSchema.safeParse(body);
  if (!validation.success) {
    return jsonError(
      validation.error.issues[0]?.message || "Invalid input",
      400
    );
  }

  // 4. Add reaction
  try {
    await addReaction(supabase, session.user.id, {
      hiveId,
      emoji: validation.data.emoji,
      message: validation.data.message,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[reactions] Error:", error);
    return jsonError("Failed to add reaction", 500);
  }
}
