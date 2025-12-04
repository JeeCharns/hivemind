import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { fetchConversationByKey, fetchHiveByKey } from "@/lib/utils/slug";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function VotePage({
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
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-2">
        {conversation.title ?? "Vote"}
      </h1>
      <p className="text-sm text-slate-600">
        Vote view content for {hive.name}
      </p>
    </div>
  );
}
