/**
 * Conversation API Route
 *
 * DELETE - Delete conversation with cascade
 * Requires authentication and admin access
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveAdmin } from "@/lib/conversations/server/requireHiveAdmin";
import { jsonError } from "@/lib/api/errors";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Get conversation to verify hive ownership
    const { data: conversation, error: fetchError } = await supabase
      .from("conversations")
      .select("hive_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (fetchError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 3. Verify admin access
    try {
      await requireHiveAdmin(supabase, session.user.id, conversation.hive_id);
    } catch {
      return jsonError("Unauthorized: Admin access required", 403);
    }

    // 4. Delete related data first (cascade)
    // Note: Consider using DB foreign key cascades for production
    const tables = [
      { table: "conversation_reports", column: "conversation_id" },
      { table: "conversation_themes", column: "conversation_id" },
      { table: "response_feedback", column: "conversation_id" },
      {
        table: "response_likes",
        column: "response_id",
        joinTable: "conversation_responses",
      },
      { table: "quadratic_vote_budgets", column: "conversation_id" },
      { table: "quadratic_vote_allocations", column: "conversation_id" },
      { table: "conversation_analysis_jobs", column: "conversation_id" },
      { table: "conversation_responses", column: "conversation_id" },
    ];

    // Delete response_likes first (needs join)
    const { data: responses } = await supabase
      .from("conversation_responses")
      .select("id")
      .eq("conversation_id", conversationId);

    if (responses && responses.length > 0) {
      const responseIds = responses.map((r) => r.id);
      await supabase
        .from("response_likes")
        .delete()
        .in("response_id", responseIds);
    }

    // Delete other tables
    for (const t of tables) {
      if (t.table === "response_likes") continue; // Already handled

      const { error } = await supabase
        .from(t.table)
        .delete()
        .eq(t.column, conversationId);

      if (error) {
        console.error(
          `[DELETE conversation] Failed to delete ${t.table}:`,
          error
        );
        return jsonError(`Failed to delete ${t.table}`, 500);
      }
    }

    // 5. Delete the conversation itself
    const { error: convoError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (convoError) {
      console.error(
        "[DELETE conversation] Failed to delete conversation:",
        convoError
      );
      return jsonError("Failed to delete conversation", 500);
    }

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    console.error("[DELETE conversation] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
