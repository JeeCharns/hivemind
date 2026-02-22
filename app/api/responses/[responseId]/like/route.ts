/**
 * Response Likes API Route
 *
 * POST - Add a like to a response
 * DELETE - Remove a like from a response
 * Requires authentication
 * Rate limited: 30 likes per minute per user
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import { broadcastLikeUpdate } from "@/lib/conversations/server/broadcastLikeUpdate";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ responseId: string }> }
) {
  try {
    const { responseId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    // 2. Check rate limit (30 likes per minute)
    const rateLimitResult = await checkRateLimit(session.user.id, "like");
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    const supabase = await supabaseServerClient();

    // 3. Verify response exists and get conversation_id for broadcast
    const { data: response, error: responseError } = await supabase
      .from("conversation_responses")
      .select("id, conversation_id")
      .eq("id", responseId)
      .maybeSingle();

    if (responseError || !response) {
      return jsonError("Response not found", 404);
    }

    // 4. Insert like (upsert to handle duplicate likes gracefully)
    const { error: insertError } = await supabase.from("response_likes").upsert(
      {
        response_id: responseId,
        user_id: session.user.id,
      },
      {
        onConflict: "response_id,user_id",
        ignoreDuplicates: true,
      }
    );

    if (insertError) {
      console.error("[POST like] Insert error:", insertError);
      return jsonError("Failed to add like", 500);
    }

    // 4. Fetch updated like count using SQL COUNT (O(1) vs O(n) row fetch)
    const { count, error: countError } = await supabase
      .from("response_likes")
      .select("*", { count: "exact", head: true })
      .eq("response_id", responseId);

    if (countError) {
      console.error("[POST like] Count error:", countError);
      return jsonError("Failed to fetch like count", 500);
    }

    const likeCount = count ?? 0;

    // 5. Broadcast like update to all feed subscribers (fire-and-forget)
    broadcastLikeUpdate({
      conversationId: response.conversation_id,
      payload: {
        responseId,
        likeCount,
        userId: session.user.id,
      },
    }).catch((err) => {
      console.error("[POST like] Broadcast failed:", err);
    });

    return NextResponse.json({
      liked: true,
      like_count: likeCount,
    });
  } catch (error) {
    console.error("[POST like] Error:", error);
    return jsonError("Internal server error", 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ responseId: string }> }
) {
  try {
    const { responseId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    // 2. Check rate limit (30 likes per minute)
    const rateLimitResult = await checkRateLimit(session.user.id, "like");
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    const supabase = await supabaseServerClient();

    // 3. Verify response exists and get conversation_id for broadcast
    const { data: response, error: responseError } = await supabase
      .from("conversation_responses")
      .select("id, conversation_id")
      .eq("id", responseId)
      .maybeSingle();

    if (responseError || !response) {
      return jsonError("Response not found", 404);
    }

    // 3. Delete like
    const { error: deleteError } = await supabase
      .from("response_likes")
      .delete()
      .eq("response_id", responseId)
      .eq("user_id", session.user.id);

    if (deleteError) {
      console.error("[DELETE like] Delete error:", deleteError);
      return jsonError("Failed to remove like", 500);
    }

    // 4. Fetch updated like count using SQL COUNT (O(1) vs O(n) row fetch)
    const { count, error: countError } = await supabase
      .from("response_likes")
      .select("*", { count: "exact", head: true })
      .eq("response_id", responseId);

    if (countError) {
      console.error("[DELETE like] Count error:", countError);
      return jsonError("Failed to fetch like count", 500);
    }

    const likeCount = count ?? 0;

    // 5. Broadcast like update to all feed subscribers (fire-and-forget)
    broadcastLikeUpdate({
      conversationId: response.conversation_id,
      payload: {
        responseId,
        likeCount,
        userId: session.user.id,
      },
    }).catch((err) => {
      console.error("[DELETE like] Broadcast failed:", err);
    });

    return NextResponse.json({
      liked: false,
      like_count: likeCount,
    });
  } catch (error) {
    console.error("[DELETE like] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
