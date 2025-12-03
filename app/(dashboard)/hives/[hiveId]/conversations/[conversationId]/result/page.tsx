"use server";

import ReportView, { type ReportContent } from "@/components/report-view";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { DEFAULT_USER_ID } from "@/lib/config";

type ConversationRow = {
  id: string;
  hive_id: string;
  type: string;
  phase: string;
  analysis_status: string;
  report_json: unknown | null;
  title: string | null;
};

type ReportVersionRow = {
  version: number;
  html: string;
  created_at: string | null;
};

type ResponseRow = { id: number; response_text: string };
type FeedbackRow = { response_id: number; feedback: "agree" | "pass" | "disagree" };

export default async function ResultPage({
  params,
}: {
  params: Promise<{ conversationId: string; hiveId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("id,hive_id,type,phase,analysis_status,report_json,title")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (convoError || !conversation) {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Result</h2>
        <p>Conversation not found.</p>
      </div>
    );
  }

  if (conversation.type !== "understand") {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Result</h2>
        <p>This tab is only available for understand conversations.</p>
      </div>
    );
  }

  const { data: membership } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", conversation.hive_id)
    .eq("user_id", DEFAULT_USER_ID)
    .maybeSingle();

  const canGenerate = membership?.role === "admin";
  const { count: responseCount } = await supabase
    .from("conversation_responses")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id);

  const { data: reports } = await supabase
    .from("conversation_reports")
    .select("version,html,created_at")
    .eq("conversation_id", conversation.id)
    .order("version", { ascending: false })
    .returns<ReportVersionRow[]>();

  const latestReport = reports?.[0]?.html ?? (conversation.report_json as string | null);

  const [{ data: responses }, { data: feedback }] = await Promise.all([
    supabase
      .from("conversation_responses")
      .select("id,response_text")
      .eq("conversation_id", conversation.id)
      .returns<ResponseRow[]>(),
    supabase
      .from("response_feedback")
      .select("response_id,feedback")
      .eq("conversation_id", conversation.id)
      .returns<FeedbackRow[]>(),
  ]);

  const feedbackCounts: Record<
    number,
    { agree: number; disagree: number; pass: number; total: number }
  > = {};
  (feedback ?? []).forEach((row) => {
    const entry =
      feedbackCounts[row.response_id] ??
      (feedbackCounts[row.response_id] = { agree: 0, disagree: 0, pass: 0, total: 0 });
    entry[row.feedback] += 1;
    entry.total += 1;
  });

  const scoredResponses =
    responses?.map((resp) => {
      const counts = feedbackCounts[resp.id] ?? { agree: 0, disagree: 0, pass: 0, total: 0 };
      const agreePct = counts.total
        ? Math.round((counts.agree / counts.total) * 100)
        : 0;
      const disagreePct = counts.total
        ? Math.round((counts.disagree / counts.total) * 100)
        : 0;
      return {
        id: resp.id,
        text: resp.response_text,
        total: counts.total,
        agreePct,
        disagreePct,
      };
    }) ?? [];

  const withEnoughVotes = scoredResponses.filter((r) => r.total > 10);
  const strongAgreement = withEnoughVotes
    .filter((r) => r.agreePct > 50)
    .sort((a, b) => b.agreePct - a.agreePct);
  const divisive = withEnoughVotes
    .filter((r) => r.agreePct <= 50)
    .sort((a, b) => a.agreePct - b.agreePct);

  return (
    <ReportView
      report={latestReport as ReportContent}
      conversationId={conversation.id}
      canGenerate={canGenerate}
      responseCount={responseCount ?? 0}
      versions={reports ?? []}
      agreementSummaries={{
        strongAgreement,
        divisive,
      }}
    />
  );
}
