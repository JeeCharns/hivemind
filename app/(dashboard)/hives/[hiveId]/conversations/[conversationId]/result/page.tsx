import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { fetchConversationByKey, fetchHiveByKey } from "@/lib/utils/slug";
import ReportView, { ReportContent } from "@/components/report-view";
import { canOpenReport } from "@/lib/utils/report-rules";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ hiveId: string; conversationId: string }>;
}) {
  const { hiveId, conversationId } = await params;
  const supabase = supabaseServerClient();
  const hive = await fetchHiveByKey(supabase, hiveId);
  const conversation = await fetchConversationByKey(
    supabase,
    hive.id,
    conversationId
  );

  const { data: versions } = await supabase
    .from("conversation_reports")
    .select("version,html,created_at")
    .eq("conversation_id", conversation.id)
    .order("version", { ascending: false });

  const { count: responseCount } = await supabase
    .from("conversation_responses")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id);

  const versionsTyped =
    versions?.map((v) => ({
      version: Number(v.version) || 0,
      html: String(v.html ?? ""),
      created_at: v.created_at ?? null,
    })) ?? [];

  const gate = canOpenReport(conversation.phase ?? "", responseCount ?? 0);

  return (
    <ReportView
      report={conversation.report_json as ReportContent}
      conversationId={conversation.id}
      canGenerate={gate.allowed}
      responseCount={responseCount ?? 0}
      versions={versionsTyped}
    />
  );
}
