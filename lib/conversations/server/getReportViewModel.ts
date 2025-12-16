/**
 * Get Report View Model - Server Data Assembly
 *
 * Fetches and assembles all data needed for the Result/Report tab
 * Follows SRP: single function to build complete view model
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ResultViewModel,
  ReportVersion,
  ReportContent,
} from "@/types/conversation-report";
import { requireHiveMember } from "./requireHiveMember";
import { canOpenReport, canGenerateReport } from "../domain/reportRules";

interface ReportRow {
  version: number;
  html: string;
  created_at: string | null;
}

/**
 * Checks if user is an admin of a hive
 *
 * @param supabase - Supabase client
 * @param userId - User UUID
 * @param hiveId - Hive UUID
 * @returns true if user is admin
 */
async function checkIsAdmin(
  supabase: SupabaseClient,
  userId: string,
  hiveId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", hiveId)
    .eq("user_id", userId)
    .maybeSingle();

  return data?.role === "admin";
}

/**
 * Assembles the complete Report view model
 *
 * @param supabase - Supabase client with service role
 * @param conversationId - Conversation UUID
 * @param userId - Current user's UUID
 * @returns Complete view model with report, versions, and gating
 */
export async function getReportViewModel(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<ResultViewModel> {
  // 1. Fetch conversation
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, hive_id, type, phase, analysis_status, report_json, title")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found");
  }

  // 2. Verify membership
  await requireHiveMember(supabase, userId, conversation.hive_id);

  // 3. Check if user is admin
  const isAdmin = await checkIsAdmin(supabase, userId, conversation.hive_id);

  // 4. Fetch data in parallel
  const [versionsResult, responseCountResult] = await Promise.all([
    // Fetch report versions
    supabase
      .from("conversation_reports")
      .select("version, html, created_at")
      .eq("conversation_id", conversationId)
      .order("version", { ascending: false }),

    // Count responses
    supabase
      .from("conversation_responses")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId),
  ]);

  if (versionsResult.error) {
    throw new Error("Failed to fetch report versions");
  }

  if (responseCountResult.error) {
    throw new Error("Failed to count responses");
  }

  const reportRows = (versionsResult.data || []) as ReportRow[];
  const responseCount = responseCountResult.count || 0;

  // 5. Build versions list
  const versions: ReportVersion[] = reportRows.map((row) => ({
    version: row.version,
    createdAt: row.created_at,
    html: row.html,
  }));

  // 6. Determine report content (latest version or report_json)
  let report: ReportContent = null;
  if (versions.length > 0) {
    report = versions[0].html;
  } else if (conversation.report_json) {
    report = conversation.report_json as ReportContent;
  }

  // 7. Compute gate and canGenerate
  const gate = canOpenReport(conversation.phase, responseCount);

  const canGenerate = canGenerateReport(
    isAdmin,
    conversation.type,
    conversation.analysis_status,
    gate
  );

  // 8. Return view model
  return {
    conversationId: conversation.id,
    report,
    versions,
    responseCount,
    canGenerate,
    gateReason: gate.allowed ? null : gate.reason,
  };
}
