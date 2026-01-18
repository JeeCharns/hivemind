/**
 * Conversation Feedback API Route
 *
 * POST - Submit feedback vote on a response
 * Requires authentication and hive membership
 * Rate limited: 20 votes per minute per user
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import type { Feedback } from "@/types/conversation-understand";
import { jsonError } from "@/lib/api/errors";
import { submitFeedbackSchema } from "@/lib/conversations/schemas";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";

const VALID_FEEDBACK: Feedback[] = ["agree", "pass", "disagree"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    // 2. Check rate limit (20 votes per minute)
    const rateLimitResult = await checkRateLimit(session.user.id, "feedback");
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    const supabase = await supabaseServerClient();

    // 3. Get conversation to verify hive membership and check type
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id, type")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 3. Verify membership
    try {
      await requireHiveMember(supabase, session.user.id, conversation.hive_id);
    } catch {
      return jsonError("Unauthorized: Not a member of this hive", 403);
    }

    // 4. Feedback is disabled for decision sessions (read-only Understand tab)
    if (conversation.type === "decide") {
      return jsonError("Feedback is disabled for decision sessions", 409, "FEEDBACK_DISABLED");
    }

    // 4. Validate input (Zod boundary validation)
    const rawBody: unknown = await req.json().catch(() => null);
    const parsed = submitFeedbackSchema.safeParse(rawBody);

    if (!parsed.success) {
      if (process.env.NODE_ENV !== "production") {
        const maybeObj = rawBody as { responseId?: unknown; feedback?: unknown } | null;
        console.log("[POST /api/conversations/:id/feedback] Invalid body", {
          conversationId,
          userId: session.user.id,
          responseIdType: typeof maybeObj?.responseId,
          feedback: maybeObj?.feedback,
          issues: parsed.error.flatten(),
        });
      }
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    const { responseId, feedback } = parsed.data;

    // Backward-compatible guard (should be redundant with Zod)
    if (!VALID_FEEDBACK.includes(feedback as Feedback)) {
      return jsonError("Invalid feedback value", 400, "VALIDATION_ERROR");
    }

    // 5. Verify response exists and belongs to this conversation
    const { data: response, error: responseError } = await supabase
      .from("conversation_responses")
      .select("id")
      .eq("id", responseId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (responseError || !response) {
      return jsonError("Response not found", 404);
    }

    // 6. Check for existing feedback to support toggle-off behavior
    const { data: existingFeedback } = await supabase
      .from("response_feedback")
      .select("feedback")
      .eq("conversation_id", conversationId)
      .eq("response_id", responseId)
      .eq("user_id", session.user.id)
      .maybeSingle();

    // If user is voting for the same feedback again, withdraw (delete) the vote
    if (existingFeedback && existingFeedback.feedback === feedback) {
      const { error: deleteError } = await supabase
        .from("response_feedback")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("response_id", responseId)
        .eq("user_id", session.user.id);

      if (deleteError) {
        console.error("[POST feedback] Delete error:", deleteError);
        return jsonError("Failed to withdraw feedback", 500);
      }
    } else {
      // Otherwise, upsert feedback (handles both insert and update)
      const { error: upsertError } = await supabase
        .from("response_feedback")
        .upsert(
          {
            conversation_id: conversationId,
            response_id: responseId,
            user_id: session.user.id,
            feedback: feedback as Feedback,
          },
          {
            onConflict: "conversation_id,response_id,user_id",
          }
        );

      if (upsertError) {
        console.error("[POST feedback] Upsert error:", upsertError);
        return jsonError("Failed to submit feedback", 500);
      }
    }

    // 7. Fetch updated counts using SQL aggregate function (O(index scan) vs O(n) row fetch)
    const { data: countsData, error: countError } = await supabase.rpc("get_feedback_counts", {
      p_response_id: responseId,
    });

    if (countError) {
      console.error("[POST feedback] Count error:", countError);
      return jsonError("Failed to fetch feedback counts", 500);
    }

    // RPC returns array with single row
    const counts = countsData?.[0] ?? { agree: 0, pass: 0, disagree: 0 };

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("[POST feedback] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
