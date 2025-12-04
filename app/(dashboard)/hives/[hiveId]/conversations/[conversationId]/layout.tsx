import ConversationHeader from "@/components/conversation-header";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { fetchConversationByKey, fetchHiveByKey } from "@/lib/utils/slug";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ hiveId: string; conversationId: string }>;
};

export default async function ConversationLayout({
  children,
  params,
}: LayoutProps) {
  const { hiveId, conversationId } = await params;
  const supabase = supabaseServerClient();

  const hive = await fetchHiveByKey(supabase, hiveId);
  const conversation = await fetchConversationByKey(
    supabase,
    hive.id,
    conversationId
  );

  return (
    <div className="overflow-hidden">
      <ConversationHeader
        hiveId={hive.id}
        hiveSlug={hive.slug ?? null}
        conversationId={conversation.id}
        conversationSlug={conversation.slug ?? null}
        hiveName={hive.name ?? undefined}
        title={conversation.title ?? `Conversation`}
      />
      <div>{children}</div>
    </div>
  );
}
