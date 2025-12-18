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
import { getUnderstandViewModel } from "@/lib/conversations/server/getUnderstandViewModel";
import UnderstandViewContainer from "@/app/components/conversation/UnderstandViewContainer";

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

  // 4. Get conversation analysis metadata
  const { data: convData } = await supabase
    .from("conversations")
    .select("analysis_status, analysis_error")
    .eq("id", conversation.id)
    .single();

  // 5. Count responses
  const { count } = await supabase
    .from("conversation_responses")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id);

  // 6. Build complete view model
  const viewModel = await getUnderstandViewModel(
    supabase,
    conversation.id,
    session.user.id
  );

  // 7. Render client container with enhanced view model
  return (
    <div className="mx-auto w-full max-w-7xl px-6">
      <UnderstandViewContainer
        initialViewModel={{
          ...viewModel,
          analysisStatus: convData?.analysis_status ?? null,
          analysisError: convData?.analysis_error ?? null,
          responseCount: count ?? 0,
          threshold: 20,
        }}
        conversationType={conversation.type as "understand" | "decide"}
      />
    </div>
  );
}
