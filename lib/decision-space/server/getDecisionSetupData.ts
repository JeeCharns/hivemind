// lib/decision-space/server/getDecisionSetupData.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import type {
  ClusterSelectionItem,
  StatementSelectionItem,
} from "@/types/decision-space";

export interface GetDecisionSetupDataResult {
  sourceConversationId: string;
  sourceTitle: string;
  clusters: ClusterSelectionItem[];
  statements: StatementSelectionItem[];
}

/**
 * Fetch clusters and statements from a completed understand session
 * for use in decision space setup wizard
 */
export async function getDecisionSetupData(
  supabase: SupabaseClient,
  userId: string,
  sourceConversationId: string
): Promise<GetDecisionSetupDataResult> {
  // 1. Fetch and validate source conversation
  const { data: sourceConv, error: convError } = await supabase
    .from("conversations")
    .select("id, hive_id, type, title, analysis_status")
    .eq("id", sourceConversationId)
    .maybeSingle();

  if (convError || !sourceConv) {
    throw new Error("Source conversation not found");
  }

  if (sourceConv.type !== "understand") {
    throw new Error("Source must be an understand session");
  }

  if (sourceConv.analysis_status !== "ready") {
    throw new Error("Analysis must be complete before creating decision session");
  }

  // 2. Verify user has access to this hive
  await requireHiveMember(supabase, userId, sourceConv.hive_id);

  // 3. Fetch clusters (themes)
  const { data: themes, error: themesError } = await supabase
    .from("conversation_themes")
    .select("cluster_index, name, description, size")
    .eq("conversation_id", sourceConversationId)
    .order("cluster_index", { ascending: true });

  if (themesError) {
    throw new Error("Failed to fetch clusters");
  }

  // 4. Fetch consolidated statements (buckets)
  const { data: buckets, error: bucketsError } = await supabase
    .from("conversation_cluster_buckets")
    .select(`
      id,
      cluster_index,
      bucket_name,
      consolidated_statement,
      response_count
    `)
    .eq("conversation_id", sourceConversationId)
    .order("cluster_index", { ascending: true })
    .order("bucket_index", { ascending: true });

  if (bucketsError) {
    throw new Error("Failed to fetch statements");
  }

  // 5. Fetch consensus data for buckets
  const bucketIds = buckets?.map((b) => b.id) || [];
  const consensusMap: Map<string, { agreePercent: number; totalVotes: number }> = new Map();

  if (bucketIds.length > 0) {
    // Get first member response for each bucket
    const { data: members } = await supabase
      .from("conversation_cluster_bucket_members")
      .select("bucket_id, response_id")
      .in("bucket_id", bucketIds);

    if (members && members.length > 0) {
      // Get unique response IDs (first per bucket)
      const bucketToResponse = new Map<string, number>();
      for (const m of members) {
        if (!bucketToResponse.has(m.bucket_id)) {
          bucketToResponse.set(m.bucket_id, m.response_id);
        }
      }

      const responseIds = Array.from(bucketToResponse.values());

      // Fetch feedback for these responses
      const { data: feedback } = await supabase
        .from("conversation_feedback")
        .select("response_id, feedback")
        .eq("conversation_id", sourceConversationId)
        .in("response_id", responseIds);

      // Calculate consensus per bucket
      if (feedback) {
        const responseToFeedback = new Map<number, { agree: number; total: number }>();
        for (const f of feedback) {
          const existing = responseToFeedback.get(f.response_id) || { agree: 0, total: 0 };
          existing.total++;
          if (f.feedback === "agree") {
            existing.agree++;
          }
          responseToFeedback.set(f.response_id, existing);
        }

        for (const [bucketId, responseId] of bucketToResponse) {
          const stats = responseToFeedback.get(responseId);
          if (stats && stats.total > 0) {
            consensusMap.set(bucketId, {
              agreePercent: Math.round((stats.agree / stats.total) * 100),
              totalVotes: stats.total,
            });
          }
        }
      }
    }
  }

  // 6. Build cluster selection items with avg consensus
  const clusterConsensus = new Map<number, number[]>();
  for (const bucket of buckets || []) {
    const consensus = consensusMap.get(bucket.id);
    if (consensus) {
      const existing = clusterConsensus.get(bucket.cluster_index) || [];
      existing.push(consensus.agreePercent);
      clusterConsensus.set(bucket.cluster_index, existing);
    }
  }

  const clusters: ClusterSelectionItem[] = (themes || []).map((theme) => {
    const consensusValues = clusterConsensus.get(theme.cluster_index) || [];
    const avgConsensus =
      consensusValues.length > 0
        ? Math.round(consensusValues.reduce((a, b) => a + b, 0) / consensusValues.length)
        : 0;

    return {
      clusterIndex: theme.cluster_index,
      name: theme.name,
      description: theme.description || "",
      statementCount: (buckets || []).filter(
        (b) => b.cluster_index === theme.cluster_index
      ).length,
      avgConsensusPercent: avgConsensus,
      selected: false,
    };
  });

  // 7. Build statement selection items
  const clusterNames = new Map(themes?.map((t) => [t.cluster_index, t.name]) || []);

  const statements: StatementSelectionItem[] = (buckets || []).map((bucket) => {
    const consensus = consensusMap.get(bucket.id);
    return {
      bucketId: bucket.id,
      clusterIndex: bucket.cluster_index,
      clusterName: clusterNames.get(bucket.cluster_index) || `Cluster ${bucket.cluster_index}`,
      statementText: bucket.consolidated_statement,
      agreePercent: consensus?.agreePercent ?? null,
      totalVotes: consensus?.totalVotes ?? 0,
      selected: false,
      recommended: false, // Will be set by UI based on threshold
    };
  });

  return {
    sourceConversationId,
    sourceTitle: sourceConv.title || "Untitled",
    clusters,
    statements,
  };
}
