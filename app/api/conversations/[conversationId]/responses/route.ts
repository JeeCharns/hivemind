/**
 * Conversation Responses API Route
 *
 * GET - List all responses for a conversation
 * POST - Create a new response
 * Requires authentication and hive membership
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { jsonError } from "@/lib/api/errors";
import { createResponseSchema } from "@/lib/conversations/schemas";
import { maybeEnqueueAutoAnalysis } from "@/lib/conversations/server/maybeEnqueueAutoAnalysis";

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

    // 2. Get conversation to verify hive membership
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id")
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

    // 4. Fetch responses with profile data and is_anonymous flag
    const { data: responses, error } = await supabase
      .from("conversation_responses")
      .select("id,response_text,tag,created_at,user_id,is_anonymous,profiles:user_id(display_name,avatar_path)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET responses] Query error:", error);
      return jsonError("Failed to fetch responses", 500);
    }

    // 5. Fetch like counts and user's likes
    const responseIds = responses?.map((r) => r.id) ?? [];
    const { data: likes } = responseIds.length
      ? await supabase
          .from("response_likes")
          .select("response_id,user_id")
          .in("response_id", responseIds)
      : { data: [] as { response_id: string; user_id: string }[] };

    // Aggregate like counts
    const likeCounts = new Map<string, number>();
    const userLikes = new Set<string>();

    likes?.forEach((like) => {
      likeCounts.set(like.response_id, (likeCounts.get(like.response_id) ?? 0) + 1);
      if (like.user_id === session.user.id) {
        userLikes.add(like.response_id);
      }
    });

    // 6. Normalize response format, masking identity for anonymous responses
    const normalized =
      responses?.map((r: unknown) => {
        const row = r as {
          id: string;
          response_text: string;
          tag: string | null;
          created_at: string;
          is_anonymous?: boolean | null;
          profiles?: { display_name?: string | null; avatar_path?: string | null } | null;
        };
        const isAnonymous = row.is_anonymous ?? false;
        return {
          id: row.id,
          text: row.response_text,
          tag: row.tag,
          createdAt: row.created_at,
          user: {
            name: isAnonymous
              ? "Anonymous"
              : (row.profiles?.display_name || "Member"),
            avatarUrl: isAnonymous ? null : (row.profiles?.avatar_path || null),
          },
          likeCount: likeCounts.get(row.id) ?? 0,
          likedByMe: userLikes.has(row.id),
        };
      }) ?? [];

    return NextResponse.json({ responses: normalized });
  } catch (error) {
    console.error("[GET responses] Error:", error);
    return jsonError("Internal server error", 500);
  }
}

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

    const supabase = await supabaseServerClient();

    // 2. Get conversation to verify hive membership and check type
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

    // 4. Validate input with Zod
    const body = await req.json();
    const validation = createResponseSchema.safeParse(body);

    if (!validation.success) {
      return jsonError("Invalid request body", 400, "INVALID_INPUT");
    }

    const { text, anonymous } = validation.data;
    let { tag } = validation.data;

    // For decision sessions, force tag to "proposal" (override client input)
    if (conversation.type === "decide") {
      tag = "proposal";
    }

    // 5. Insert response
    const { data, error } = await supabase
      .from("conversation_responses")
      .insert({
        conversation_id: conversationId,
        response_text: text.trim(),
        tag: tag || null,
        user_id: session.user.id,
        is_anonymous: !!anonymous,
      })
      .select("id,response_text,tag,created_at,user_id,is_anonymous,profiles:user_id(display_name,avatar_path)")
      .maybeSingle();

    if (error || !data) {
      console.error("[POST response] Insert error:", error);
      return jsonError("Failed to create response", 500);
    }

    // 6. Format response using persisted is_anonymous value
    const profile = data.profiles as
      | { display_name?: string | null; avatar_path?: string | null }
      | null
      | undefined;
    const isAnonymous = data.is_anonymous ?? false;
    const response = {
      id: data.id,
      text: data.response_text,
      tag: data.tag,
      createdAt: data.created_at,
      user: {
        name: isAnonymous ? "Anonymous" : (profile?.display_name || "Member"),
        avatarUrl: isAnonymous ? null : (profile?.avatar_path || null),
      },
      likeCount: 0,
      likedByMe: false,
    };

    // 7. Maybe trigger auto-analysis at 20 responses
    const analysisResult = await maybeEnqueueAutoAnalysis(
      supabase,
      conversationId,
      session.user.id
    );

    return NextResponse.json({
      response,
      analysis: {
        triggered: analysisResult.triggered,
        status: analysisResult.status,
      },
    });
  } catch (error) {
    console.error("[POST response] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
