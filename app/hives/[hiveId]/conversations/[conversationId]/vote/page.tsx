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

  // 3. Redirect to appropriate page based on conversation type
  // For understand sessions, go to listen
  if (conversation.type !== "decide") {
    redirect(
      `/hives/${hive.slug || hive.id}/conversations/${conversation.slug || conversation.id}/listen`
    );
  }

  // For decide sessions, redirect to the unified /decide page
  redirect(
    `/hives/${hive.slug || hive.id}/conversations/${conversation.slug || conversation.id}/decide`
  );
}
