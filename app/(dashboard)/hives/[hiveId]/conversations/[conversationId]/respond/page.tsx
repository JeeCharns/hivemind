"use server";

import RespondView from "@/components/respond-view";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { DEFAULT_USER_ID } from "@/lib/config";

type ConversationRow = {
  id: string;
  hive_id: string;
  type: string;
  phase: string;
  analysis_status: string;
};

type ResponseRow = {
  id: number;
  response_text: string;
  tag: string | null;
  cluster_index: number | null;
};

type ThemeRow = {
  cluster_index: number;
  name: string | null;
  description: string | null;
  size: number | null;
};
type FeedbackRow = {
  response_id: number;
  feedback: "agree" | "pass" | "disagree";
};

export default async function RespondPage({
  params,
}: {
  params: Promise<{ conversationId: string; hiveId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("id,hive_id,type,phase,analysis_status")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (convoError || !conversation) {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Respond</h2>
        <p>Conversation not found.</p>
      </div>
    );
  }

  if (conversation.type !== "understand") {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Respond</h2>
        <p>This tab is only available for understand conversations.</p>
      </div>
    );
  }

  if (
    conversation.phase === "listen_open" ||
    conversation.phase === "understand_open"
  ) {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Respond</h2>
        <p>Admin hasn&apos;t opened this stage yet.</p>
      </div>
    );
  }

  if (conversation.analysis_status !== "ready") {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Respond</h2>
        <p>Analysis must complete before feedback.</p>
      </div>
    );
  }

  const [
    { data: responses },
    { data: themes },
    { data: counts },
    { data: mine },
  ] =
    await Promise.all([
      supabase
        .from("conversation_responses")
        .select("id,response_text,tag,cluster_index")
        .eq("conversation_id", conversation.id)
        .order("id", { ascending: true })
        .returns<ResponseRow[]>(),
      supabase
        .from("conversation_themes")
        .select("cluster_index,name,description,size")
        .eq("conversation_id", conversation.id)
        .order("cluster_index", { ascending: true })
        .returns<ThemeRow[]>(),
      supabase
        .from("response_feedback")
        .select("response_id,feedback")
        .eq("conversation_id", conversation.id),
      supabase
        .from("response_feedback")
        .select("response_id,feedback")
        .eq("conversation_id", conversation.id)
        .eq("user_id", DEFAULT_USER_ID),
    ]);

  const countMap: Record<
    number,
    { agree: number; pass: number; disagree: number }
  > = {};
  (counts as FeedbackRow[] | null)?.forEach((c) => {
    const { response_id: id, feedback: fb } = c;
    if (!countMap[id]) {
      countMap[id] = { agree: 0, pass: 0, disagree: 0 };
    }
    countMap[id][fb] = (countMap[id][fb] ?? 0) + 1;
  });

  const mineMap: Record<number, "agree" | "pass" | "disagree"> = {};
  (mine as FeedbackRow[] | null)?.forEach((m) => {
    mineMap[m.response_id] = m.feedback;
  });

  const responseItems =
    responses?.map((r) => ({
      id: r.id,
      response_text: r.response_text,
      tag: r.tag,
      cluster_index: r.cluster_index,
      counts: countMap[r.id] ?? { agree: 0, pass: 0, disagree: 0 },
      current: mineMap[r.id] ?? null,
    })) ?? [];

  if (responseItems.length === 0) {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Respond</h2>
        <p>No responses yet. Upload on Listen to get started.</p>
      </div>
    );
  }

  return (
    <RespondView
      responses={responseItems}
      themes={themes ?? []}
      conversationId={conversation.id}
    />
  );
}
