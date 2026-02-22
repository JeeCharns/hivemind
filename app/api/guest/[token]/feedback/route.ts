/**
 * Guest Feedback API
 *
 * POST /api/guest/[token]/feedback — submit feedback on a response
 *
 * Auth: guest session cookie required.
 * Same toggle-off behaviour as authenticated feedback.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { guestSubmitFeedbackSchema } from "@/lib/conversations/guest/schemas";
import { requireGuestSession } from "@/lib/conversations/guest/requireGuestSession";

export const dynamic = "force-dynamic";

/** System user for guest operations. */
const SYSTEM_USER_ID = "c8661a31-3493-4c0f-9f14-0c08fcc68696";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const result = await requireGuestSession(token);
    if (!result.ok) return result.error;

    const { adminClient, conversationId, session } = result.ctx;

    // Check conversation type — feedback disabled for decision sessions
    const { data: convo } = await adminClient
      .from("conversations")
      .select("type")
      .eq("id", conversationId)
      .single();

    if (convo?.type === "decide") {
      return jsonError(
        "Feedback is disabled for decision sessions",
        409,
        "FEEDBACK_DISABLED"
      );
    }

    // Validate input
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = guestSubmitFeedbackSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    const { responseId, feedback } = parsed.data;

    // Verify response belongs to this conversation
    const { data: resp, error: respErr } = await adminClient
      .from("conversation_responses")
      .select("id")
      .eq("id", responseId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (respErr || !resp) {
      return jsonError("Response not found", 404);
    }

    // Check for existing guest feedback (toggle-off behaviour)
    const { data: existing } = await adminClient
      .from("response_feedback")
      .select("feedback")
      .eq("conversation_id", conversationId)
      .eq("response_id", responseId)
      .eq("guest_session_id", session.guestSessionId)
      .maybeSingle();

    if (existing && existing.feedback === feedback) {
      // Same feedback again → withdraw
      const { error: delErr } = await adminClient
        .from("response_feedback")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("response_id", responseId)
        .eq("guest_session_id", session.guestSessionId);

      if (delErr) {
        console.error("[POST guest/feedback] Delete error:", delErr);
        return jsonError("Failed to withdraw feedback", 500);
      }
    } else {
      // Insert or update
      if (existing) {
        // Update existing
        const { error: updateErr } = await adminClient
          .from("response_feedback")
          .update({ feedback })
          .eq("conversation_id", conversationId)
          .eq("response_id", responseId)
          .eq("guest_session_id", session.guestSessionId);

        if (updateErr) {
          console.error("[POST guest/feedback] Update error:", updateErr);
          return jsonError("Failed to update feedback", 500);
        }
      } else {
        // Insert new
        const { error: insertErr } = await adminClient
          .from("response_feedback")
          .insert({
            conversation_id: conversationId,
            response_id: responseId,
            user_id: SYSTEM_USER_ID,
            guest_session_id: session.guestSessionId,
            feedback,
          });

        if (insertErr) {
          console.error("[POST guest/feedback] Insert error:", insertErr);
          return jsonError("Failed to submit feedback", 500);
        }
      }
    }

    // Fetch updated counts
    const { data: countsData, error: countErr } = await adminClient.rpc(
      "get_feedback_counts",
      { p_response_id: responseId }
    );

    if (countErr) {
      console.error("[POST guest/feedback] Count error:", countErr);
      return jsonError("Failed to fetch feedback counts", 500);
    }

    const counts = countsData?.[0] ?? { agree: 0, pass: 0, disagree: 0 };
    return NextResponse.json({ counts });
  } catch (err) {
    console.error("[POST guest/feedback]", err);
    return jsonError("Internal server error", 500);
  }
}
