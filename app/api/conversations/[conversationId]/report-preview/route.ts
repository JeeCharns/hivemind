import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import type { ReportPreviewResponse } from "@/lib/conversations/schemas";

/**
 * GET /api/conversations/[conversationId]/report-preview?version=N
 * Fetch a specific report version (or latest) for preview in decision session wizard
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  console.log("[GET /api/conversations/:id/report-preview] Starting");

  const session = await getServerSession();

  if (!session) {
    console.log("[GET /api/conversations/:id/report-preview] No session");
    return jsonError("Unauthorized", 401);
  }

  const { conversationId } = await params;
  const supabase = await supabaseServerClient();

  // Get the conversation to verify hive membership
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, hive_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    console.log(
      "[GET /api/conversations/:id/report-preview] Conversation not found"
    );
    return jsonError("Conversation not found", 404);
  }

  // Authorization: verify user is a member of the hive
  const { data: member } = await supabase
    .from("hive_members")
    .select("*")
    .eq("hive_id", conversation.hive_id)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!member) {
    console.log(
      "[GET /api/conversations/:id/report-preview] User not a member"
    );
    return jsonError("Forbidden", 403);
  }

  // Get optional version parameter
  const { searchParams } = new URL(request.url);
  const versionParam = searchParams.get("version");
  const requestedVersion = versionParam ? parseInt(versionParam, 10) : null;

  // Build query for the report
  let query = supabase
    .from("conversation_reports")
    .select("version, html, created_at")
    .eq("conversation_id", conversationId);

  if (requestedVersion !== null) {
    // Fetch specific version
    query = query.eq("version", requestedVersion);
  } else {
    // Fetch latest version
    query = query.order("version", { ascending: false }).limit(1);
  }

  const { data: report, error: reportError } = await query.maybeSingle();

  if (reportError) {
    console.error(
      "[GET /api/conversations/:id/report-preview] Query error:",
      reportError
    );
    return jsonError("Failed to fetch report", 500);
  }

  if (!report) {
    console.log("[GET /api/conversations/:id/report-preview] Report not found");
    return jsonError("Report not found", 404);
  }

  const response: ReportPreviewResponse = {
    version: report.version,
    html: report.html,
    createdAt: report.created_at,
  };

  console.log(
    `[GET /api/conversations/:id/report-preview] Returning version ${report.version}`
  );

  return NextResponse.json(response);
}
