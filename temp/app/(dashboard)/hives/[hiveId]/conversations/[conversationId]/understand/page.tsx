import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { fetchConversationByKey, fetchHiveByKey } from "@/lib/utils/slug";
import UnderstandView from "@/components/understand-view";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function UnderstandPage({
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

  const [{ data: responses }, { data: themes }, { data: feedback }] =
    await Promise.all([
      supabase
        .from("conversation_responses")
        .select("id,response_text,tag,cluster_index,x_umap,y_umap")
        .eq("conversation_id", conversation.id),
      supabase
        .from("conversation_themes")
        .select("cluster_index,name,description,size")
        .eq("conversation_id", conversation.id)
        .order("cluster_index", { ascending: true }),
      supabase
        .from("response_feedback")
        .select("response_id,feedback")
        .eq("conversation_id", conversation.id),
    ]);

  const feedbackMap: Record<
    number,
    { agree: number; pass: number; disagree: number }
  > = {};
  feedback?.forEach(
    (row: { response_id: number; feedback: "agree" | "pass" | "disagree" }) => {
      if (!feedbackMap[row.response_id]) {
        feedbackMap[row.response_id] = { agree: 0, pass: 0, disagree: 0 };
      }
      feedbackMap[row.response_id][row.feedback] += 1;
    }
  );

  const feedbackItems =
    responses?.map((r) => ({
      id: r.id,
      response_text: r.response_text,
      tag: r.tag,
      cluster_index: r.cluster_index,
      counts: feedbackMap[r.id] ?? { agree: 0, pass: 0, disagree: 0 },
      current: null,
    })) ?? [];

  const responsePoints =
    responses?.map((r) => ({
      id: r.id,
      response_text: r.response_text,
      tag: r.tag,
      cluster_index: r.cluster_index ?? 0,
      x_umap: Number(r.x_umap ?? 0),
      y_umap: Number(r.y_umap ?? 0),
    })) ?? [];

  const themesRows =
    themes?.map((t) => ({
      cluster_index: t.cluster_index,
      name: t.name,
      description: t.description,
      size: t.size,
    })) ?? [];

  return (
    <UnderstandView
      responses={responsePoints}
      themes={themesRows}
      feedbackItems={feedbackItems}
      conversationId={conversation.id}
    />
  );
}
