/**
 * Deliberate Statement Comments API Route
 *
 * GET - Fetch comments for a specific statement
 * Requires authentication
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { jsonError } from "@/lib/api/errors";

interface RouteParams {
  params: Promise<{ conversationId: string; statementId: string }>;
}

interface ProfileData {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * GET /api/conversations/[conversationId]/deliberate/statements/[statementId]/comments
 * Fetch comments for a specific statement
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { statementId } = await params;
    const session = await getServerSession();

    if (!session?.user?.id) {
      return jsonError("Unauthorised", 401);
    }

    const supabase = await supabaseAdminClient();

    // Fetch comments (without profile join - no direct FK relationship)
    const { data: comments, error } = await supabase
      .from("deliberation_comments")
      .select("id, statement_id, comment_text, is_anonymous, created_at, user_id")
      .eq("statement_id", statementId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET comments] Error:", error);
      return jsonError("Failed to fetch comments", 500);
    }

    // Get unique user IDs for profile lookup (excluding anonymous)
    const userIds = [
      ...new Set(
        (comments || [])
          .filter((c) => !c.is_anonymous && c.user_id)
          .map((c) => c.user_id)
      ),
    ];

    // Fetch profiles separately
    const profileMap = new Map<string, ProfileData>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      for (const profile of profiles || []) {
        profileMap.set(profile.id, profile);
      }
    }

    const formattedComments = (comments || []).map((c) => {
      const profile = c.user_id ? profileMap.get(c.user_id) : null;
      return {
        id: String(c.id),
        statementId: c.statement_id,
        text: c.comment_text,
        isAnonymous: c.is_anonymous,
        createdAt: c.created_at,
        user: {
          id: c.is_anonymous ? null : c.user_id,
          name: c.is_anonymous
            ? "Anonymous"
            : profile?.display_name || "Unknown",
          avatarUrl: c.is_anonymous ? null : profile?.avatar_url || null,
        },
        isMine: c.user_id === session.user.id,
      };
    });

    return NextResponse.json({ comments: formattedComments });
  } catch (error) {
    console.error("[GET comments] Error:", error);
    return jsonError("Internal error", 500);
  }
}
