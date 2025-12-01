"use server";

import { Suspense } from "react";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import UnderstandView from "@/components/understand-view";
import { DEFAULT_USER_ID } from "@/lib/config";

type ConversationRow = {
  id: string;
  hive_id: string;
  type: string;
  phase: string;
  analysis_status: string;
  analysis_error: string | null;
};

type ResponseRow = {
  id: number;
  response_text: string;
  tag: string | null;
  cluster_index: number | null;
  x_umap: number | null;
  y_umap: number | null;
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

export default async function UnderstandPage({
  params,
}: {
  params: Promise<{ hiveId: string; conversationId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("id,hive_id,type,phase,analysis_status,analysis_error")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (convoError || !conversation) {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Understand</h2>
        <p>Conversation not found.</p>
      </div>
    );
  }

  if (conversation.type !== "understand") {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Understand</h2>
        <p>This tab is only available for understand conversations.</p>
      </div>
    );
  }

  if (comparePhase(conversation.phase, "understand_open") < 0) {
    return (
      <div className="space-y-3 text-slate-700 p-8">
        <h2 className="text-xl font-medium text-slate-900">Understand</h2>
        <p>Upload your survey resutls in the listen tab to unlock this!</p>
      </div>
    );
  }

  if (conversation.analysis_status !== "ready") {
    const stateCopy: Record<string, string> = {
      not_started: "Analysis has not been run yet.",
      embedding: "Processing responses (embedding)…",
      analyzing: "Processing responses (clustering)…",
      error: conversation.analysis_error
        ? `Analysis failed: ${conversation.analysis_error}`
        : "Analysis failed.",
    };
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Understand</h2>
        <p>{stateCopy[conversation.analysis_status] ?? "Processing…"}</p>
      </div>
    );
  }

  const [
    { data: responses },
    { data: themes },
    { data: counts },
    { data: mine },
  ] = await Promise.all([
    supabase
      .from("conversation_responses")
      .select("id,response_text,tag,cluster_index,x_umap,y_umap")
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

  if (!responses || responses.length === 0) {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Understand</h2>
        <p>No responses yet. Upload your survey results on the Listen tab.</p>
      </div>
    );
  }

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

  const feedbackItems =
    responses?.map((r) => ({
      id: r.id,
      response_text: r.response_text,
      tag: r.tag,
      cluster_index: r.cluster_index,
      counts: countMap[r.id] ?? { agree: 0, pass: 0, disagree: 0 },
      current: mineMap[r.id] ?? null,
    })) ?? [];

  const points =
    responses?.flatMap((r) => {
      if (r.x_umap === null || r.y_umap === null || r.cluster_index === null) {
        return [];
      }
      return [
        {
          id: r.id,
          response_text: r.response_text,
          tag: r.tag,
          cluster_index: r.cluster_index,
          x_umap: r.x_umap,
          y_umap: r.y_umap,
        },
      ];
    }) ?? [];

  return (
    <Suspense
      fallback={
        <div className="space-y-3 text-slate-700 animate-pulse">
          <div className="h-6 w-32 bg-slate-100 rounded" />
          <div className="h-72 bg-slate-100 rounded" />
        </div>
      }
    >
      <UnderstandView
        responses={points}
        themes={themes ?? []}
        feedbackItems={feedbackItems}
        conversationId={conversation.id}
      />
    </Suspense>
  );
}
