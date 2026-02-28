/**
 * Discuss Page - Server Component
 *
 * Renders the Discuss tab for deliberate conversations with statement voting
 * Follows server-first pattern: fetches view model on server
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getDeliberateViewModel } from "@/lib/deliberate-space/server/getDeliberateViewModel";
import { resolveHiveAndConversation } from "@/lib/conversations/server/resolveHiveAndConversation";
import { authorizeHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
import DiscussViewContainer from "@/app/components/conversation/DiscussViewContainer";

interface PageProps {
  params: Promise<{ hiveId: string; conversationId: string }>;
}

export default async function DiscussPage({ params }: PageProps) {
  const { hiveId: hiveKey, conversationId: conversationKey } = await params;

  // 1. Verify authentication
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = await supabaseServerClient();

  // 2. Resolve hive and conversation from slugs/keys
  const { hive, conversation } = await resolveHiveAndConversation(
    supabase,
    hiveKey,
    conversationKey
  );

  // 3. Get deliberate view model
  const viewModel = await getDeliberateViewModel(supabase, {
    conversationId: conversation.id,
    userId: session.user.id,
  });

  if (!viewModel) {
    redirect(`/hives/${hiveKey}`);
  }

  // 4. Check if user is admin
  const isAdmin = await authorizeHiveAdmin(supabase, session.user.id, hive.id);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <DiscussViewContainer initialViewModel={viewModel} isAdmin={isAdmin} />
    </div>
  );
}
