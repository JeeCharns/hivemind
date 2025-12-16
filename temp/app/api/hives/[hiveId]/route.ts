import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  const { hiveId } = await params;
  if (!hiveId) {
    return NextResponse.json({ error: "Hive ID is required" }, { status: 400 });
  }

  const supabase = supabaseServerClient();

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
      await supabase.from("conversation_reports").delete().in("conversation_id", conversationIds);
      await supabase.from("conversation_themes").delete().in("conversation_id", conversationIds);
      await supabase.from("conversation_responses").delete().in("conversation_id", conversationIds);
    }

    // Delete conversations
    await supabase.from("conversations").delete().eq("hive_id", hiveId);

    // Delete hive memberships
    await supabase.from("hive_members").delete().eq("hive_id", hiveId);

    // Finally delete the hive record
    const { error: hiveErr } = await supabase.from("hives").delete().eq("id", hiveId);
    if (hiveErr) throw hiveErr;

    return NextResponse.json({ message: "Hive deleted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete hive";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
