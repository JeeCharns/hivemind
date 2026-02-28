/**
 * Deliberate Space Setup Data API Route
 *
 * GET - Fetch clusters and statements from a source understand or explore conversation
 * Used by the deliberate setup wizard to populate selection options
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getDeliberateSetupDataSchema } from "@/lib/deliberate-space/schemas";
import { jsonError } from "@/lib/api/errors";

interface Theme {
  cluster_index: number;
  name: string;
  description: string | null;
}

interface Bucket {
  id: string;
  cluster_index: number;
  bucket_index: number;
  consolidated_statement: string;
}

/**
 * GET /api/deliberate-space/setup
 * Returns clusters and statements from a source conversation for deliberate setup
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised", 401);
    }

    // 2. Parse and validate query params
    const { searchParams } = new URL(request.url);
    const parsed = getDeliberateSetupDataSchema.safeParse({
      sourceConversationId: searchParams.get("sourceConversationId"),
    });

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues?.[0]?.message || "Invalid input",
        400
      );
    }

    const { sourceConversationId } = parsed.data;
    const supabase = await supabaseServerClient();

    // 3. Verify conversation exists and user has access
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, hive_id")
      .eq("id", sourceConversationId)
      .single();

    if (convError || !conversation) {
      console.error(
        "[GET /api/deliberate-space/setup] Conversation not found:",
        convError
      );
      return jsonError("Conversation not found", 404);
    }

    // Check membership
    const { data: membership, error: memberError } = await supabase
      .from("hive_members")
      .select("id")
      .eq("hive_id", conversation.hive_id)
      .eq("user_id", session.user.id)
      .single();

    if (memberError || !membership) {
      return jsonError("Not a member of this hive", 403);
    }

    // 4. Get themes (clusters)
    const { data: themes, error: themesError } = await supabase
      .from("conversation_themes")
      .select("cluster_index, name, description")
      .eq("conversation_id", sourceConversationId)
      .order("cluster_index");

    if (themesError) {
      console.error(
        "[GET /api/deliberate-space/setup] Failed to fetch themes:",
        themesError
      );
      return jsonError("Failed to fetch clusters", 500);
    }

    // 5. Get cluster buckets (consolidated statements)
    const { data: buckets, error: bucketsError } = await supabase
      .from("conversation_cluster_buckets")
      .select("id, cluster_index, bucket_index, consolidated_statement")
      .eq("conversation_id", sourceConversationId)
      .order("cluster_index")
      .order("bucket_index");

    if (bucketsError) {
      console.error(
        "[GET /api/deliberate-space/setup] Failed to fetch buckets:",
        bucketsError
      );
      return jsonError("Failed to fetch statements", 500);
    }

    // 6. Transform to response shape
    const typedThemes = (themes || []) as Theme[];
    const typedBuckets = (buckets || []) as Bucket[];

    const clusters = typedThemes.map((t) => ({
      clusterIndex: t.cluster_index,
      name: t.name,
      description: t.description || "",
      statementCount: typedBuckets.filter(
        (b) => b.cluster_index === t.cluster_index
      ).length,
    }));

    const statements = typedBuckets.map((b) => {
      const theme = typedThemes.find((t) => t.cluster_index === b.cluster_index);
      return {
        bucketId: b.id,
        clusterIndex: b.cluster_index,
        clusterName: theme?.name || `Cluster ${b.cluster_index}`,
        statementText: b.consolidated_statement,
      };
    });

    return NextResponse.json({ clusters, statements });
  } catch (error) {
    console.error("[GET /api/deliberate-space/setup] Error:", error);
    return jsonError("Internal error", 500);
  }
}
