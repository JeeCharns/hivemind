/**
 * Moderation History Page - Server Component
 *
 * Displays moderation history for a conversation
 * Accessible to all hive members, reinstate available to admins only
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveAndConversation } from "@/lib/conversations/server/resolveHiveAndConversation";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { authorizeHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
import ModerationHistoryView from "@/app/components/conversation/ModerationHistoryView";

interface ModerationPageProps {
  params: Promise<{
    hiveId: string;
    conversationId: string;
  }>;
}

export default async function ModerationPage({ params }: ModerationPageProps) {
  const { hiveId: hiveKey, conversationId: conversationKey } = await params;

  // 1. Verify authentication
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = await supabaseServerClient();

  // 2. Resolve hive and conversation
  const { hive, conversation } = await resolveHiveAndConversation(
    supabase,
    hiveKey,
    conversationKey
  );

  // 3. Verify membership
  await requireHiveMember(supabase, session.user.id, hive.id);

  // 4. Check admin status
  const isAdmin = await authorizeHiveAdmin(supabase, session.user.id, hive.id);

  // Note: ConversationHeader is rendered by the layout
  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-6">
      <ModerationHistoryView
        conversationId={conversation.id}
        isAdmin={isAdmin}
      />
    </div>
  );
}
