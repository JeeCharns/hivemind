/**
 * Bucket Responses API Route
 *
 * GET - Fetch responses for a specific cluster bucket (for incremental loading)
 * Requires authentication and hive membership
 * Supports pagination via offset/limit query params
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { jsonError } from "@/lib/api/errors";
import type { BucketResponse } from "@/types/conversation-understand";

// Default and max limits for pagination
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string; bucketId: string }> }
) {
  try {
    const { conversationId, bucketId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Verify conversation exists and get hive_id
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, hive_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 3. Verify hive membership
    try {
      await requireHiveMember(supabase, session.user.id, conversation.hive_id);
    } catch {
      return jsonError("Unauthorized: Not a member of this hive", 403);
    }

    // 4. Verify bucket exists and belongs to this conversation
    const { data: bucket, error: bucketError } = await supabase
      .from("conversation_cluster_buckets")
      .select("id, conversation_id")
      .eq("id", bucketId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (bucketError || !bucket) {
      return jsonError("Bucket not found", 404);
    }

    // 5. Parse pagination params
    const url = new URL(req.url);
    const offset = Math.max(
      0,
      parseInt(url.searchParams.get("offset") || "0", 10) || 0
    );
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) ||
          DEFAULT_LIMIT
      )
    );

    // 6. Fetch response IDs from bucket members with pagination
    const { data: members, error: membersError } = await supabase
      .from("conversation_cluster_bucket_members")
      .select("response_id")
      .eq("bucket_id", bucketId)
      .range(offset, offset + limit - 1);

    if (membersError) {
      console.error("[GET bucket responses] Members error:", membersError);
      return jsonError("Failed to fetch bucket members", 500);
    }

    if (!members || members.length === 0) {
      return NextResponse.json({
        responses: [],
        offset,
        limit,
        hasMore: false,
      });
    }

    // 7. Fetch full response data for these IDs
    const responseIds = members.map((m) => String(m.response_id));
    const { data: responses, error: responsesError } = await supabase
      .from("conversation_responses")
      .select("id, response_text, tag")
      .in("id", responseIds);

    if (responsesError) {
      console.error("[GET bucket responses] Responses error:", responsesError);
      return jsonError("Failed to fetch responses", 500);
    }

    // 8. Build response array preserving order from members query
    const responseMap = new Map(
      (responses || []).map((r) => [String(r.id), r])
    );

    const bucketResponses: BucketResponse[] = responseIds
      .map((id) => {
        const resp = responseMap.get(id);
        return resp
          ? {
              id: String(resp.id),
              responseText: resp.response_text,
              tag: resp.tag,
            }
          : null;
      })
      .filter((r): r is BucketResponse => r !== null);

    // 9. Check if there are more responses
    const { count: totalCount } = await supabase
      .from("conversation_cluster_bucket_members")
      .select("response_id", { count: "exact", head: true })
      .eq("bucket_id", bucketId);

    const hasMore = offset + limit < (totalCount ?? 0);

    return NextResponse.json({
      responses: bucketResponses,
      offset,
      limit,
      hasMore,
      total: totalCount ?? 0,
    });
  } catch (error) {
    console.error("[GET bucket responses] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
