import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { fetchConversationByKey, fetchHiveByKey } from "@/lib/utils/slug";
import ReportView from "@/components/report-view";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function ReportPage({
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

  return (
    <ReportView
      report={conversation.report_json as any}
      conversationId={conversation.id}
      versions={versions ?? []}
    />
  );
}
