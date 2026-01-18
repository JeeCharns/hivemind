/**
 * Conversation Understand API Route
 *
 * GET - Get complete Understand view model
 * Allows UI to refresh understand data including analysis status
 * Requires authentication and hive membership
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getUnderstandViewModel } from "@/lib/conversations/server/getUnderstandViewModel";
import { jsonError } from "@/lib/api/errors";
import { UNDERSTAND_MIN_RESPONSES } from "@/lib/conversations/domain/thresholds";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Get conversation metadata
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, analysis_status, analysis_error")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 3. Get complete view model (includes membership check)
    const viewModel = await getUnderstandViewModel(
      supabase,
      conversationId,
      session.user.id
    );

    // 4. Count responses
    const { count, error: countError } = await supabase
      .from("conversation_responses")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (countError) {
      console.error("[GET understand] Count error:", countError);
      return jsonError("Failed to fetch response count", 500);
    }

    // 5. Return enhanced view model with analysis metadata
    // DEBUG: Add bucket count to help diagnose missing clusterBuckets
    const debugInfo = {
      clusterBucketsCount: viewModel.clusterBuckets?.length ?? 0,
      hasClusterBuckets: !!viewModel.clusterBuckets,
      firstBucketName: viewModel.clusterBuckets?.[0]?.bucketName ?? "none",
    };
    console.log("[GET understand] Debug info:", debugInfo);

    return NextResponse.json({
      ...viewModel,
      analysisStatus: conversation.analysis_status,
      analysisError: conversation.analysis_error,
      responseCount: count ?? 0,
      threshold: UNDERSTAND_MIN_RESPONSES,
      _debug: debugInfo, // Temporary debug field
    });
  } catch (error) {
    console.error("[GET understand] Error:", error);

    // Handle authorization errors
    if (error instanceof Error && error.message.includes("not a member")) {
      return jsonError("Unauthorized: Not a member of this hive", 403);
    }

    return jsonError("Internal server error", 500);
  }
}
