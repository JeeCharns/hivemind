/**
 * Result Page - Server Component
 *
 * Renders the Result/Report tab with executive summary
 * Follows server-first pattern: fetches and assembles data on server
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveAndConversation } from "@/lib/conversations/server/resolveHiveAndConversation";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { getReportViewModel } from "@/lib/conversations/server/getReportViewModel";
import ReportView from "@/app/components/conversation/ReportView";

interface ResultPageProps {
  params: Promise<{
    hiveId: string;
    conversationId: string;
  }>;
}

export default async function ResultPage({ params }: ResultPageProps) {
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

  // 4. Build complete view model
  const viewModel = await getReportViewModel(
    supabase,
    conversation.id,
    session.user.id
  );

  // 5. Render client component with view model
  return (
    <div className="mx-auto w-full max-w-7xl px-6">
      <ReportView viewModel={viewModel} />
    </div>
  );
}
