import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { openai } from "@/lib/openai/client";
import { DEFAULT_USER_ID } from "@/lib/config";

export const runtime = "nodejs";

type ConversationRow = {
  id: string;
  hive_id: string;
  type: string;
  phase: string;
  analysis_status: string;
  report_json: unknown | null;
};

const phaseOrder = [
  "listen_open",
  "understand_open",
  "respond_open",
  "vote_open",
  "report_open",
] as const;

const comparePhase = (phase: string, target: string) =>
  phaseOrder.indexOf(phase as (typeof phaseOrder)[number]) -
  phaseOrder.indexOf(target as (typeof phaseOrder)[number]);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();
  const userId = DEFAULT_USER_ID;

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("id,hive_id,type,phase,analysis_status,report_json")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (convoError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (conversation.type !== "understand") {
    return NextResponse.json(
      { error: "Report generation only for understand conversations" },
      { status: 400 },
    );
  }

  if (comparePhase(conversation.phase, "report_open") < 0) {
    return NextResponse.json(
      { error: "Report phase not open" },
      { status: 409 },
    );
  }

  if (conversation.analysis_status !== "ready") {
    return NextResponse.json(
      { error: "Analysis must be ready before generating a report" },
      { status: 409 },
    );
  }

  const { data: membership } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", conversation.hive_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can generate reports" },
      { status: 403 },
    );
  }

  const [{ data: themes }, { data: responses }, { data: feedback }] =
    await Promise.all([
      supabase
        .from("conversation_themes")
        .select("cluster_index,name,description,size")
        .eq("conversation_id", conversation.id)
        .order("cluster_index", { ascending: true }),
      supabase
        .from("conversation_responses")
        .select("id,cluster_index,response_text,tag")
        .eq("conversation_id", conversation.id),
      supabase
        .from("response_feedback")
        .select("response_id,feedback"),
    ]);

  if (!responses || responses.length === 0) {
    return NextResponse.json(
      { error: "No responses available to generate a report" },
      { status: 400 },
    );
  }

  const feedbackMap: Record<
    number,
    { agree: number; pass: number; disagree: number }
  > = {};
  feedback?.forEach(
    (row: { response_id: number; feedback: "agree" | "pass" | "disagree" }) => {
      if (!feedbackMap[row.response_id]) {
        feedbackMap[row.response_id] = { agree: 0, pass: 0, disagree: 0 };
      }
      feedbackMap[row.response_id][row.feedback] += 1;
    },
  );

  const themedResponses =
    (responses ?? []).map(
      (r: {
        id: number;
        cluster_index: number;
        response_text: string;
        tag: string | null;
      }) => ({
        id: r.id,
        cluster_index: r.cluster_index,
        response_text: r.response_text,
        tag: r.tag,
        counts: feedbackMap[r.id] ?? { agree: 0, pass: 0, disagree: 0 },
      }),
    ) ?? [];

  const prompt = [
    {
      role: "system" as const,
      content:
        "You are a facilitator summarizing survey responses. Generate a concise report with sections: Overview, Top consensus items, Divisive items, Key themes by tag (problem, need, risk, proposal), Suggested next steps. Keep it structured and succinct.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        themes: themes ?? [],
        responses: themedResponses.slice(0, 200), // trim to reasonable size
      }),
    },
  ];

  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: prompt,
    });

    const content = chat.choices[0]?.message?.content ?? "";
    let reportJson: unknown = null;
    try {
      reportJson = JSON.parse(content);
    } catch {
      reportJson = { markdown: content };
    }

    const { error: updateError } = await supabase
      .from("conversations")
      .update({ report_json: reportJson })
      .eq("id", conversation.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Generated but failed to save report" },
        { status: 500 },
      );
    }

    return NextResponse.json({ report: reportJson });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
