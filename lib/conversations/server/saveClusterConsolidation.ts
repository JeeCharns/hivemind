/**
 * Save Cluster Consolidation
 *
 * Persists LLM-driven cluster consolidation results to database.
 * Called during analysis pipeline after cluster consolidation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClusterConsolidationResult } from "@/lib/analysis/openai/clusterConsolidator";
import { DEFAULT_CLUSTER_CONSOLIDATION_PARAMS } from "@/lib/analysis/openai/clusterConsolidator";

/**
 * Save cluster consolidation results to database
 *
 * @param supabase - Supabase client (service role)
 * @param conversationId - Conversation UUID
 * @param results - Consolidation results from LLM
 */
export async function saveClusterConsolidation(
  supabase: SupabaseClient,
  conversationId: string,
  results: ClusterConsolidationResult[]
): Promise<void> {
  console.log(
    `[saveClusterConsolidation] Saving consolidation for ${results.length} clusters in ${conversationId}`
  );

  // Delete existing consolidation data for this conversation
  await Promise.all([
    supabase
      .from("conversation_cluster_buckets")
      .delete()
      .eq("conversation_id", conversationId),
    supabase
      .from("conversation_unconsolidated_responses")
      .delete()
      .eq("conversation_id", conversationId),
  ]);

  if (results.length === 0) {
    console.log("[saveClusterConsolidation] No results to save");
    return;
  }

  // Prepare bucket rows
  const bucketRows: Array<{
    conversation_id: string;
    cluster_index: number;
    bucket_name: string;
    bucket_index: number;
    consolidated_statement: string;
    response_count: number;
    model_used: string;
    prompt_version: string;
  }> = [];

  // Track bucket metadata for member insertion
  const bucketMetadata: Array<{
    clusterIndex: number;
    bucketIndex: number;
    responseIds: string[];
  }> = [];

  for (const result of results) {
    for (
      let bucketIndex = 0;
      bucketIndex < result.buckets.length;
      bucketIndex++
    ) {
      const bucket = result.buckets[bucketIndex];
      bucketRows.push({
        conversation_id: conversationId,
        cluster_index: result.clusterIndex,
        bucket_name: bucket.bucketName,
        bucket_index: bucketIndex,
        consolidated_statement: bucket.consolidatedStatement,
        response_count: bucket.responseIds.length,
        model_used: DEFAULT_CLUSTER_CONSOLIDATION_PARAMS.model,
        prompt_version: DEFAULT_CLUSTER_CONSOLIDATION_PARAMS.promptVersion,
      });
      bucketMetadata.push({
        clusterIndex: result.clusterIndex,
        bucketIndex,
        responseIds: bucket.responseIds,
      });
    }
  }

  // Insert buckets and get their IDs
  if (bucketRows.length > 0) {
    const { data: insertedBuckets, error: bucketError } = await supabase
      .from("conversation_cluster_buckets")
      .insert(bucketRows)
      .select("id, cluster_index, bucket_index");

    if (bucketError || !insertedBuckets) {
      console.error(
        "[saveClusterConsolidation] Failed to insert buckets:",
        bucketError
      );
      throw new Error(`Failed to save buckets: ${bucketError?.message}`);
    }

    console.log(
      `[saveClusterConsolidation] Inserted ${insertedBuckets.length} buckets`
    );

    // Build bucket ID lookup
    const bucketIdMap = new Map<string, string>();
    for (const bucket of insertedBuckets) {
      const key = `${bucket.cluster_index}-${bucket.bucket_index}`;
      bucketIdMap.set(key, bucket.id);
    }

    // Prepare member rows
    const memberRows: Array<{ bucket_id: string; response_id: string }> = [];
    for (const meta of bucketMetadata) {
      const key = `${meta.clusterIndex}-${meta.bucketIndex}`;
      const bucketId = bucketIdMap.get(key);
      if (bucketId) {
        for (const responseId of meta.responseIds) {
          memberRows.push({
            bucket_id: bucketId,
            response_id: responseId,
          });
        }
      }
    }

    // Insert members in batches
    if (memberRows.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < memberRows.length; i += BATCH_SIZE) {
        const batch = memberRows.slice(i, i + BATCH_SIZE);
        const { error: memberError } = await supabase
          .from("conversation_cluster_bucket_members")
          .insert(batch);

        if (memberError) {
          console.error(
            `[saveClusterConsolidation] Failed to save member batch:`,
            memberError
          );
          throw new Error(
            `Failed to save bucket members: ${memberError.message}`
          );
        }
      }
      console.log(
        `[saveClusterConsolidation] Inserted ${memberRows.length} bucket members`
      );
    }
  }

  // Save unconsolidated responses
  const unconsolidatedRows: Array<{
    conversation_id: string;
    cluster_index: number;
    response_id: string;
  }> = [];

  for (const result of results) {
    for (const responseId of result.unconsolidatedIds) {
      unconsolidatedRows.push({
        conversation_id: conversationId,
        cluster_index: result.clusterIndex,
        response_id: responseId,
      });
    }
  }

  if (unconsolidatedRows.length > 0) {
    const { error: unconsolidatedError } = await supabase
      .from("conversation_unconsolidated_responses")
      .insert(unconsolidatedRows);

    if (unconsolidatedError) {
      console.error(
        "[saveClusterConsolidation] Failed to save unconsolidated:",
        unconsolidatedError
      );
      // Don't throw - unconsolidated is optional tracking
    } else {
      console.log(
        `[saveClusterConsolidation] Saved ${unconsolidatedRows.length} unconsolidated responses`
      );
    }
  }

  // Log stats
  const totalBuckets = bucketRows.length;
  const totalConsolidated = bucketMetadata.reduce(
    (sum, m) => sum + m.responseIds.length,
    0
  );
  const totalUnconsolidated = unconsolidatedRows.length;

  console.log(`[saveClusterConsolidation] Stats:`, {
    clusters: results.length,
    buckets: totalBuckets,
    consolidatedResponses: totalConsolidated,
    unconsolidatedResponses: totalUnconsolidated,
    consolidationRate: `${((totalConsolidated / (totalConsolidated + totalUnconsolidated || 1)) * 100).toFixed(1)}%`,
  });
}
