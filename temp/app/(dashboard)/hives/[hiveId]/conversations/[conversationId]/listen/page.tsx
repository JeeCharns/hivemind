import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { fetchConversationByKey, fetchHiveByKey } from "@/lib/utils/slug";
import { getCurrentUserProfile } from "@/lib/utils/user";
import ListenView from "@/components/listen-view";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type AnalysisStatus = "not_started" | "embedding" | "analyzing" | "ready" | "error";

export default async function ListenPage({
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
  const currentUser = await getCurrentUserProfile(supabase);
  const currentUserName =
    currentUser?.displayName || currentUser?.email || "User";

  return (
    <ListenView
      conversationId={conversation.id}
      currentUserName={currentUserName}
      initialAnalysisStatus={
        (conversation.analysis_status as AnalysisStatus) ?? "not_started"
      }
    />
  );
}
