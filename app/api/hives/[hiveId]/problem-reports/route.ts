import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import type { ProblemReportListItem } from "@/lib/conversations/schemas";

/**
 * GET /api/hives/[hiveId]/problem-reports
 * List all problem space conversations in a hive that have at least one report
 * Used by decision session wizard to select a source report
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  console.log("[GET /api/hives/:hiveId/problem-reports] Starting");

  const session = await getServerSession();

  if (!session) {
    console.log("[GET /api/hives/:hiveId/problem-reports] No session");
    return jsonError("Unauthorized", 401);
  }

  const { hiveId } = await params;
  const supabase = await supabaseServerClient();

  // Authorization: verify user is a member of the hive
  const { data: member } = await supabase
    .from("hive_members")
    .select("*")
    .eq("hive_id", hiveId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!member) {
    console.log(
      "[GET /api/hives/:hiveId/problem-reports] User not a member of hive"
    );
    return jsonError("Forbidden", 403);
  }

  // Query conversations that:
  // 1. Are in the hive
  // 2. Have type = "understand" (problem space)
  // 3. Have at least one report in conversation_reports
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select(
      `
      id,
      slug,
      title,
      conversation_reports!inner (
        version,
        created_at
      )
    `
    )
    .eq("hive_id", hiveId)
    .eq("type", "understand")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "[GET /api/hives/:hiveId/problem-reports] Query error:",
      error
    );
    return jsonError("Failed to fetch problem reports", 500);
  }

  // Group by conversation and find latest report version
  const reportMap = new Map<
    string,
    {
      conversationId: string;
      conversationSlug: string | null;
      title: string | null;
      latestReportVersion: number;
      latestReportCreatedAt: string | null;
    }
  >();

  for (const conv of conversations || []) {
    const existing = reportMap.get(conv.id);
    const reports = Array.isArray(conv.conversation_reports)
      ? conv.conversation_reports
      : [conv.conversation_reports];

    for (const report of reports) {
      if (!existing || report.version > existing.latestReportVersion) {
        reportMap.set(conv.id, {
          conversationId: conv.id,
          conversationSlug: conv.slug,
          title: conv.title,
          latestReportVersion: report.version,
          latestReportCreatedAt: report.created_at,
        });
      }
    }
  }

  const result: ProblemReportListItem[] = Array.from(reportMap.values());

  console.log(
    `[GET /api/hives/:hiveId/problem-reports] Returning ${result.length} reports`
  );

  return NextResponse.json(result);
}
