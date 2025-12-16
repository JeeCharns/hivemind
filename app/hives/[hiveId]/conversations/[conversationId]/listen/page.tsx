/**
 * Listen Page - Server Component
 *
 * Renders the Listen tab with response composer and live feed
 * Follows server-first pattern: fetches initial data on server
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveAndConversation } from "@/lib/conversations/server/resolveHiveAndConversation";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import ListenView from "@/app/components/conversation/ListenView";
import type { AnalysisStatus } from "@/types/conversations";

interface ListenPageProps {
  params: Promise<{
    hiveId: string;
    conversationId: string;
  }>;
}

export default async function ListenPage({ params }: ListenPageProps) {
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

  // 4. Get current user's display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", session.user.id)
    .maybeSingle();

  const currentUserDisplayName = profile?.display_name || "User";

  // 5. Render client component with initial data
  return (
    <div className="mx-auto w-full max-w-7xl px-6">
      <ListenView
        conversationId={conversation.id}
        currentUserDisplayName={currentUserDisplayName}
        initialAnalysisStatus={conversation.analysis_status as AnalysisStatus | null}
      />
    </div>
  );
}
