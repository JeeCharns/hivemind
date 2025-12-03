"use server";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();

  // Remove related data first
  const tables = [
    { table: "conversation_reports", column: "conversation_id" },
    { table: "conversation_themes", column: "conversation_id" },
    { table: "response_feedback", column: "conversation_id" },
    { table: "conversation_responses", column: "conversation_id" },
  ];

  for (const t of tables) {
    const { error } = await supabase
      .from(t.table)
      .delete()
      .eq(t.column, conversationId);
    if (error) {
      return NextResponse.json(
        { error: `Failed to delete ${t.table}` },
        { status: 500 }
      );
    }
  }

  const { error: convoError } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId);

  if (convoError) {
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "Deleted" });
}
