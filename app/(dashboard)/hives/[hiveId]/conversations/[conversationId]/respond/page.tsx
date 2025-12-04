import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { fetchConversationByKey, fetchHiveByKey } from "@/lib/utils/slug";
import ListenView from "@/components/listen-view";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function RespondPage({
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

  return (
    <ListenView
      hiveId={hive.id}
      conversationId={conversation.id}
      currentUserName="User"
      initialAnalysisStatus={(conversation.analysis_status as any) ?? "not_started"}
    />
  );
}
