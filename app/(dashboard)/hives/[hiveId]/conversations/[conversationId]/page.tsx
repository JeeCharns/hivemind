type ConversationPageProps = {
  params: { conversationId: string; hiveId: string };
};

export default function ConversationPage({ params }: ConversationPageProps) {
  return (
    <div className="space-y-2 text-slate-700">
      <h3 className="text-lg font-semibold">
        Conversation {params.conversationId}
      </h3>
      <p>Choose a tab (listen, understand, respond, vote, report).</p>
    </div>
  );
}
