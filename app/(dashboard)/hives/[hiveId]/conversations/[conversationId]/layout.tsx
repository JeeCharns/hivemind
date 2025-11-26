export default function ConversationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">
          Conversation
        </h2>
      </header>
      {children}
    </div>
  );
}
