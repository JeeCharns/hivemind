import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getCurrentUserProfile } from "@/lib/utils/user";

type ConversationRow = {
  id: string;
  hive_id: string;
  type: string;
  phase: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();
  const currentUser = await getCurrentUserProfile(supabase);
  const userId = currentUser?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: convo, error: convoError } = await supabase
    .from("conversations")
    .select("id,hive_id,type,phase")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (convoError || !convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (convo.type !== "understand") {
    return NextResponse.json(
      { error: "Feedback only for understand conversations" },
      { status: 400 },
    );
  }

  if (convo.phase === "listen_open" || convo.phase === "understand_open") {
    return NextResponse.json(
      { error: "Respond phase not open" },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const responseId = body?.responseId as number | undefined;
  const feedback = body?.feedback as "agree" | "pass" | "disagree" | undefined;

  if (!responseId || !feedback) {
    return NextResponse.json(
      { error: "responseId and feedback are required" },
      { status: 400 },
    );
  }

  const { error: upsertError } = await supabase.from("response_feedback").upsert(
    {
      conversation_id: conversationId,
      response_id: responseId,
      user_id: userId,
      feedback,
    },
    {
      onConflict: "conversation_id,response_id,user_id",
    },
  );

  if (upsertError) {
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 },
    );
  }

  const { data: counts } = await supabase
    .from("response_feedback")
    .select("feedback")
    .eq("conversation_id", conversationId)
    .eq("response_id", responseId);

  const aggregate: Record<"agree" | "pass" | "disagree", number> = {
    agree: 0,
    pass: 0,
    disagree: 0,
  };
  counts?.forEach((c) => {
    const fb = (c as { feedback: "agree" | "pass" | "disagree" }).feedback;
    aggregate[fb] = (aggregate[fb] ?? 0) + 1;
  });

  return NextResponse.json({ counts: aggregate });
}
