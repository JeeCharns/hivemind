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
import { LISTEN_TAGS } from "@/lib/conversations/domain/tags";

const MAX_RESPONSE_LENGTH = 500;

export async function GET(
  _req: NextRequest,
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

    // 4. Fetch responses with profile data and is_anonymous flag
    const { data: responses, error } = await supabase
      .from("conversation_responses")
      .select("id,response_text,tag,created_at,user_id,is_anonymous,profiles:user_id(display_name,avatar_path)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET responses] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch responses" },
        { status: 500 }
      );
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
      responses?.map((r: any) => {
        const isAnonymous = r.is_anonymous ?? false;
        return {
          id: r.id,
          text: r.response_text,
          tag: r.tag,
          createdAt: r.created_at,
          user: {
            name: isAnonymous ? "Anonymous" : (r.profiles?.display_name || "Member"),
            avatarUrl: isAnonymous ? null : (r.profiles?.avatar_path || null),
          },
          likeCount: likeCounts.get(r.id) ?? 0,
          likedByMe: userLikes.has(r.id),
        };
      }) ?? [];

    return NextResponse.json({ responses: normalized });
  } catch (error) {
    console.error("[GET responses] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
    const { text, tag, anonymous } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    if (text.length > MAX_RESPONSE_LENGTH) {
      return NextResponse.json(
        { error: `Text must be ${MAX_RESPONSE_LENGTH} characters or less` },
        { status: 400 }
      );
    }

    if (tag && !LISTEN_TAGS.includes(tag)) {
      return NextResponse.json(
        { error: "Invalid tag" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Failed to create response" },
        { status: 500 }
      );
    }

    // 6. Format response using persisted is_anonymous value
    const profile: any = data.profiles;
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

    return NextResponse.json({ response });
  } catch (error) {
    console.error("[POST response] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
