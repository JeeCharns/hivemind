import ConversationHeader from "@/components/conversation-header";
import { supabaseServerClient } from "@/lib/supabase/serverClient";

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

  const [{ data: conversation }, { data: hive }] = await Promise.all([
    supabase
      .from("conversations")
      .select("title")
      .eq("id", conversationId)
      .maybeSingle(),
    supabase.from("hives").select("name").eq("id", hiveId).maybeSingle(),
  ]);

  return (
    <div className="overflow-hidden">
      <ConversationHeader
        hiveId={hiveId}
        conversationId={conversationId}
        hiveName={hive?.name}
        title={conversation?.title ?? `Conversation ${conversationId}`}
      />
      <div>{children}</div>
    </div>
  );
}
