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

export default async function ResultPage({
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

  return (
    <ReportView
      report={conversation.report_json as ReportContent}
      conversationId={conversation.id}
      canGenerate={canGenerate}
    />
  );
}
