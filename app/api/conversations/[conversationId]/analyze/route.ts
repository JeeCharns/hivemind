/**
 * POST /api/conversations/[conversationId]/analyze
 *
 * Trigger conversation analysis with intelligent strategy selection
 * Supports manual and regenerate modes with incremental/full strategies
 * Requires authentication and hive admin access
 * Returns 202 Accepted with job status and strategy metadata
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { triggerConversationAnalysis } from "@/lib/conversations/server/triggerConversationAnalysis";
import { triggerAnalysisRequestSchema } from "@/lib/conversations/schemas";
import { jsonError } from "@/lib/api/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    // Authenticate user
    const session = await requireAuth();
    const userId = session.user.id;

    // Get conversation ID from URL params
    const { conversationId } = await params;

    if (!conversationId) {
      return jsonError("Conversation ID is required", 400, "VALIDATION_ERROR");
    }

    // Parse and validate request body
    let requestBody;
    try {
      const body = await request.json().catch(() => ({}));
      requestBody = triggerAnalysisRequestSchema.parse(body);
    } catch {
      return jsonError(
        "Invalid request body",
        400,
        "VALIDATION_ERROR"
      );
    }

    // Get Supabase client
    const supabase = await supabaseServerClient();

    // Trigger analysis with strategy decision
    const result = await triggerConversationAnalysis(
      supabase,
      conversationId,
      userId,
      requestBody,
      { requireAdmin: true }
    );

    // Return 202 Accepted for queued jobs, 200 for already running/complete
    const statusCode = result.status === "queued" ? 202 : 200;

    return NextResponse.json(result, { status: statusCode });
  } catch (err) {
    console.error(
      "[POST /api/conversations/[conversationId]/analyze] Error:",
      err
    );

    const message = err instanceof Error ? err.message : "Internal server error";

    let errorMessage = "Failed to start analysis";
    let statusCode = 500;

    if (message.includes("not found")) {
      errorMessage = "Conversation not found";
      statusCode = 404;
    } else if (message.includes("Unauthorized")) {
      errorMessage = "Unauthorized";
      statusCode = 403;
    }

    return jsonError(
      errorMessage,
      statusCode,
      statusCode === 404
        ? "NOT_FOUND"
        : statusCode === 403
          ? "UNAUTHORIZED"
          : "INTERNAL_ERROR"
    );
  }
}
