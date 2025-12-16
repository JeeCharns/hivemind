/**
 * Conversation Feedback API Route
 *
 * POST - Submit feedback vote on a response
 * Requires authentication and hive membership
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import type { Feedback } from "@/types/conversation-understand";

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
      return NextResponse.json(
        { error: "Unauthorized: Not authenticated" },
        { status: 401 }
      );
    }

    const supabase = await supabaseServerClient();

    // 2. Get conversation to verify hive membership
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // 3. Verify membership
    try {
      await requireHiveMember(supabase, session.user.id, conversation.hive_id);
    } catch (err) {
      return NextResponse.json(
        { error: "Unauthorized: Not a member of this hive" },
        { status: 403 }
      );
    }

    // 4. Validate input
    const body = await req.json();
    const { responseId, feedback } = body;

    if (!responseId || typeof responseId !== "string") {
      return NextResponse.json(
        { error: "Response ID is required" },
        { status: 400 }
      );
    }

    if (!feedback || !VALID_FEEDBACK.includes(feedback as Feedback)) {
      return NextResponse.json(
        { error: "Invalid feedback value" },
        { status: 400 }
      );
    }

    // 5. Verify response exists and belongs to this conversation
    const { data: response, error: responseError } = await supabase
      .from("conversation_responses")
      .select("id")
      .eq("id", responseId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (responseError || !response) {
      return NextResponse.json(
        { error: "Response not found" },
        { status: 404 }
      );
    }

    // 6. Upsert feedback (handles both insert and update)
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
      return NextResponse.json(
        { error: "Failed to submit feedback" },
        { status: 500 }
      );
    }

    // 7. Fetch updated counts for this response
    const { data: feedbackRows, error: countError } = await supabase
      .from("response_feedback")
      .select("feedback")
      .eq("response_id", responseId);

    if (countError) {
      console.error("[POST feedback] Count error:", countError);
      return NextResponse.json(
        { error: "Failed to fetch feedback counts" },
        { status: 500 }
      );
    }

    // Aggregate counts
    const counts = {
      agree: 0,
      pass: 0,
      disagree: 0,
    };

    feedbackRows?.forEach((row) => {
      const fb = row.feedback as Feedback;
      if (fb === "agree" || fb === "pass" || fb === "disagree") {
        counts[fb]++;
      }
    });

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("[POST feedback] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
