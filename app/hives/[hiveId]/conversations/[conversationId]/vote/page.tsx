/**
 * Vote Page - Server Component
 *
 * Renders the Vote tab for decision sessions with quadratic voting
 * Follows server-first pattern: fetches and assembles data on server
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveAndConversation } from "@/lib/conversations/server/resolveHiveAndConversation";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { getVoteViewModel } from "@/lib/conversations/server/getVoteViewModel";
import VoteViewContainer from "@/app/components/conversation/VoteViewContainer";

interface VotePageProps {
  params: Promise<{
    hiveId: string;
    conversationId: string;
  }>;
}

export default async function VotePage({ params }: VotePageProps) {
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

  // 3. Verify this is a decision session
  if (conversation.type !== "decide") {
    redirect(
      `/hives/${hive.slug || hive.id}/conversations/${conversation.slug || conversation.id}/listen`
    );
  }

  // 4. Verify membership (throws if not a member)
  await requireHiveMember(supabase, session.user.id, hive.id);

  // 5. Build complete view model
  const viewModel = await getVoteViewModel(
    supabase,
    conversation.id,
    session.user.id
  );

  // 6. Render client component with view model
  return (
    <div className="mx-auto w-full max-w-7xl px-6">
      <VoteViewContainer
        conversationId={conversation.id}
        proposals={viewModel.proposals}
        totalCreditsSpent={viewModel.totalCreditsSpent}
        remainingCredits={viewModel.remainingCredits}
      />
    </div>
  );
}
