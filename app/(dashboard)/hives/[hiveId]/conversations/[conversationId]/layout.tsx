import ConversationHeader from "@/components/conversation-header";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ hiveId: string; conversationId: string }>;
};

export default async function ConversationLayout({
  children,
  params,
}: LayoutProps) {
  const { hiveId, conversationId } = await params;

  return (
    <div className="bg-white rounded-2xl overflow-hidden">
      <ConversationHeader
        hiveId={hiveId}
        conversationId={conversationId}
        title={`Conversation ${conversationId}`}
      />
      <div className="p-8">{children}</div>
    </div>
  );
}
