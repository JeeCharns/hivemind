/**
 * Response Likes API Route
 *
 * POST - Add a like to a response
 * DELETE - Remove a like from a response
 * Requires authentication
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";

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

    const supabase = await supabaseServerClient();

    // 2. Verify response exists
    const { data: response, error: responseError } = await supabase
      .from("conversation_responses")
      .select("id")
      .eq("id", responseId)
      .maybeSingle();

    if (responseError || !response) {
      return jsonError("Response not found", 404);
    }

    // 3. Insert like (upsert to handle duplicate likes gracefully)
    const { error: insertError } = await supabase
      .from("response_likes")
      .upsert(
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

    // 4. Fetch updated like count
    const { data: likes, error: countError } = await supabase
      .from("response_likes")
      .select("user_id")
      .eq("response_id", responseId);

    if (countError) {
      console.error("[POST like] Count error:", countError);
      return jsonError("Failed to fetch like count", 500);
    }

    return NextResponse.json({
      liked: true,
      like_count: likes?.length ?? 0,
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

    const supabase = await supabaseServerClient();

    // 2. Verify response exists
    const { data: response, error: responseError } = await supabase
      .from("conversation_responses")
      .select("id")
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

    // 4. Fetch updated like count
    const { data: likes, error: countError } = await supabase
      .from("response_likes")
      .select("user_id")
      .eq("response_id", responseId);

    if (countError) {
      console.error("[DELETE like] Count error:", countError);
      return jsonError("Failed to fetch like count", 500);
    }

    return NextResponse.json({
      liked: false,
      like_count: likes?.length ?? 0,
    });
  } catch (error) {
    console.error("[DELETE like] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
