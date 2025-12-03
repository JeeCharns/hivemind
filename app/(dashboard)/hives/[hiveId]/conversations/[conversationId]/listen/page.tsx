"use server";

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import ListenView from "@/components/listen-view";
import { DEFAULT_USER_ID } from "@/lib/config";

type ConversationRow = {
  id: string;
  hive_id: string;
  type: string;
  phase: string;
  analysis_status: string;
  analysis_error: string | null;
};

type AnalysisStatus =
  | "not_started"
  | "embedding"
  | "analyzing"
  | "ready"
  | "error";

export default async function ListenPage({
  params,
}: {
  params: Promise<{ conversationId: string; hiveId: string }>;
}) {
  const { conversationId, hiveId } = await params;
  const supabase = supabaseServerClient();

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("id,hive_id,type,phase,analysis_status,analysis_error")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", DEFAULT_USER_ID)
    .maybeSingle();

  if (convoError || !conversation) {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Listen</h2>
        <p>Conversation not found.</p>
      </div>
    );
  }

  if (conversation.type !== "understand") {
    return (
      <div className="space-y-3 text-slate-700">
        <h2 className="text-xl font-medium text-slate-900">Listen</h2>
        <p>This tab is only available for understand conversations.</p>
      </div>
    );
  }

  return (
    <ListenView
      conversationId={conversation.id}
      currentUserName={profile?.display_name ?? "User"}
      initialAnalysisStatus={
        (["not_started", "embedding", "analyzing", "ready", "error"].includes(
          conversation.analysis_status,
        )
          ? conversation.analysis_status
          : "not_started") as AnalysisStatus
      }
    />
  );
}
