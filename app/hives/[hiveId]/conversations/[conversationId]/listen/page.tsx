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

  // 3b. Redirect decide conversations to the decide page
  if (conversation.type === "decide") {
    redirect(
      `/hives/${hive.slug || hive.id}/conversations/${conversation.slug || conversation.id}/decide`
    );
  }

  // 4. Get current user's display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", session.user.id)
    .maybeSingle();

  const currentUserDisplayName = profile?.display_name || "User";

  // 5. Fetch source report preview if this is a decision session with linked report
  let sourceReportHtml: string | null = null;
  let sourceReportConversationTitle: string | null = null;

  if (
    conversation.type === "decide" &&
    conversation.source_conversation_id &&
    conversation.source_report_version
  ) {
    try {
      // Fetch the source conversation title
      const { data: sourceConv } = await supabase
        .from("conversations")
        .select("title")
        .eq("id", conversation.source_conversation_id)
        .maybeSingle();

      sourceReportConversationTitle = sourceConv?.title || "Problem Space Report";

      // Fetch the report HTML from conversation_reports table
      const { data: reportData } = await supabase
        .from("conversation_reports")
        .select("report_html")
        .eq("conversation_id", conversation.source_conversation_id)
        .eq("version", conversation.source_report_version)
        .maybeSingle();

      if (reportData?.report_html) {
        sourceReportHtml = reportData.report_html;
      }
    } catch (err) {
      console.error("[ListenPage] Failed to fetch source report:", err);
      // Continue without report preview
    }
  }

  // 6. Render client component with initial data
  return (
    <div className="mx-auto w-full max-w-7xl px-0 md:px-6">
      <ListenView
        conversationId={conversation.id}
        currentUserDisplayName={currentUserDisplayName}
        initialAnalysisStatus={conversation.analysis_status as AnalysisStatus | null}
        sourceReportHtml={sourceReportHtml}
        sourceReportConversationTitle={sourceReportConversationTitle}
        conversationType={conversation.type as "understand" | "decide"}
        sourceConversationId={conversation.source_conversation_id}
      />
    </div>
  );
}
