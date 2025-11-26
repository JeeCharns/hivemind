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

export default async function ReportPage({
  params,
}: {
  params: Promise<{ conversationId: string; hiveId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("id,hive_id,type,phase,analysis_status,report_json")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (convoError || !conversation) {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Report</h2>
        <p>Conversation not found.</p>
      </div>
    );
  }

  if (conversation.type !== "understand") {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Report</h2>
        <p>This tab is only available for understand conversations.</p>
      </div>
    );
  }

  if (comparePhase(conversation.phase, "report_open") < 0) {
    return (
      <div className="space-y-3 text-slate-70 p-8">
        <h2 className="text-xl font-medium text-slate-900">Report</h2>
        <p>Upload your survey resutls in the listen tab to unlock this!</p>
      </div>
    );
  }

  if (conversation.analysis_status !== "ready") {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Report</h2>
        <p>Analysis must complete before the report is available.</p>
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

  return (
    <ReportView
      report={conversation.report_json as ReportContent}
      conversationId={conversation.id}
      canGenerate={canGenerate}
    />
  );
}
