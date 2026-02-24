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
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { jsonError } from "@/lib/api/errors";
import { createResponseSchema } from "@/lib/conversations/schemas";
import { broadcastResponse } from "@/lib/conversations/server/broadcastResponse";
import { getAvatarUrl } from "@/lib/storage/server/getAvatarUrl";

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

    // 4. Fetch responses with profile data, is_anonymous flag, and guest_session_id
    //    Note: guest_sessions join is done separately via admin client because
    //    guest_sessions has RLS with no user-facing SELECT policy.
    const { data: responses, error } = await supabase
      .from("conversation_responses")
      .select(
        "id,response_text,tag,created_at,user_id,is_anonymous,guest_session_id,profiles:user_id(display_name,avatar_path)"
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET responses] Query error:", error);
      return jsonError("Failed to fetch responses", 500);
    }

    // 4b. Look up guest numbers via admin client (bypasses RLS on guest_sessions)
    const guestSessionIds = [
      ...new Set(
        (responses ?? [])
          .map((r) => (r as { guest_session_id?: string | null }).guest_session_id)
          .filter((id): id is string => !!id)
      ),
    ];
    const guestNumberMap = new Map<string, number>();
    if (guestSessionIds.length > 0) {
      const adminClient = supabaseAdminClient();
      const { data: guestRows } = await adminClient
        .from("guest_sessions")
        .select("id, guest_number")
        .in("id", guestSessionIds);

      guestRows?.forEach(
        (row: { id: string; guest_number: number }) => {
          guestNumberMap.set(row.id, row.guest_number);
        }
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
      likeCounts.set(
        like.response_id,
        (likeCounts.get(like.response_id) ?? 0) + 1
      );
      if (like.user_id === session.user.id) {
        userLikes.add(like.response_id);
      }
    });

    // 6. Normalize response format, masking identity for anonymous responses
    // Collect unique avatar paths to convert to signed URLs
    const avatarPaths = new Set<string>();
    responses?.forEach((r: unknown) => {
      const row = r as {
        is_anonymous?: boolean | null;
        profiles?: { avatar_path?: string | null } | null;
      };
      if (!row.is_anonymous && row.profiles?.avatar_path) {
        avatarPaths.add(row.profiles.avatar_path);
      }
    });

    // Generate signed URLs for all unique avatar paths
    const avatarUrlMap = new Map<string, string>();
    await Promise.all(
      Array.from(avatarPaths).map(async (path) => {
        const signedUrl = await getAvatarUrl(supabase, path);
        avatarUrlMap.set(path, signedUrl);
      })
    );

    const normalized =
      responses?.map((r: unknown) => {
        const row = r as {
          id: string;
          response_text: string;
          tag: string | null;
          created_at: string;
          user_id: string;
          is_anonymous?: boolean | null;
          guest_session_id?: string | null;
          profiles?: {
            display_name?: string | null;
            avatar_path?: string | null;
          } | null;
        };
        const isAnonymous = row.is_anonymous ?? false;
        const isGuest = !!row.guest_session_id;
        const guestNumber = row.guest_session_id
          ? guestNumberMap.get(row.guest_session_id) ?? null
          : null;
        const avatarPath = row.profiles?.avatar_path;

        let displayName: string;
        if (isGuest && guestNumber != null) {
          displayName = `Guest ${guestNumber}`;
        } else if (isAnonymous) {
          displayName = "Anonymous";
        } else {
          displayName = row.profiles?.display_name || "Member";
        }

        return {
          id: row.id,
          text: row.response_text,
          tag: row.tag,
          createdAt: row.created_at,
          user: {
            name: displayName,
            avatarUrl:
              isAnonymous || isGuest
                ? null
                : avatarPath
                  ? (avatarUrlMap.get(avatarPath) ?? null)
                  : null,
          },
          likeCount: likeCounts.get(row.id) ?? 0,
          likedByMe: userLikes.has(row.id),
          isMine: row.user_id === session.user.id,
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
      .select(
        "id,response_text,tag,created_at,user_id,is_anonymous,profiles:user_id(display_name,avatar_path)"
      )
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

    // Get signed URL for avatar if available
    let avatarUrl: string | null = null;
    if (!isAnonymous && profile?.avatar_path) {
      avatarUrl = await getAvatarUrl(supabase, profile.avatar_path);
    }

    const response = {
      id: data.id,
      text: data.response_text,
      tag: data.tag,
      createdAt: data.created_at,
      user: {
        name: isAnonymous ? "Anonymous" : profile?.display_name || "Member",
        avatarUrl,
      },
      likeCount: 0,
      likedByMe: false,
      isMine: true,
    };

    // 7. Broadcast response to all feed subscribers (fire-and-forget)
    // This enables real-time updates without requiring clients to refetch
    broadcastResponse({ conversationId, response }).catch((err) => {
      console.error("[POST response] Broadcast error (non-fatal):", err);
    });

    return NextResponse.json({
      response,
    });
  } catch (error) {
    console.error("[POST response] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
