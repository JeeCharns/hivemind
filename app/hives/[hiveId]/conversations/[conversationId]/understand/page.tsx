/**
 * Understand Page - Server Component
 *
 * Renders the Understand tab with theme map and feedback system
 * Follows server-first pattern: fetches and assembles data on server
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveAndConversation } from "@/lib/conversations/server/resolveHiveAndConversation";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { authorizeHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
import { getUnderstandViewModel } from "@/lib/conversations/server/getUnderstandViewModel";
import UnderstandViewContainer from "@/app/components/conversation/UnderstandViewContainer";

// Force dynamic rendering - no caching
export const dynamic = "force-dynamic";

interface UnderstandPageProps {
  params: Promise<{
    hiveId: string;
    conversationId: string;
  }>;
}

export default async function UnderstandPage({ params }: UnderstandPageProps) {
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

  // 3. Verify membership (throws if not a member)
  await requireHiveMember(supabase, session.user.id, hive.id);

  // 3b. Redirect decide conversations to the unified /decide page
  if (conversation.type === "decide") {
    redirect(
      `/hives/${hive.slug || hive.id}/conversations/${conversation.slug || conversation.id}/decide`
    );
  }

  // 4. Check admin privileges
  const isAdmin = await authorizeHiveAdmin(supabase, session.user.id, hive.id);

  // 5. Build complete view model (includes staleness metadata)
  console.log("[UnderstandPage] Calling getUnderstandViewModel for:", conversation.id);
  const viewModel = await getUnderstandViewModel(
    supabase,
    conversation.id,
    session.user.id
  );
  console.log("[UnderstandPage] viewModel.clusterBuckets count:", viewModel.clusterBuckets?.length ?? 0);

  // 6. Render client container with view model
  return (
    <div className="mx-auto w-full max-w-7xl px-6">
      <UnderstandViewContainer
        initialViewModel={viewModel}
        conversationType={conversation.type as "understand" | "decide"}
        isAdmin={isAdmin}
      />
    </div>
  );
}
