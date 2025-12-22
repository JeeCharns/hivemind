/**
 * Run Conversation Analysis (Incremental)
 *
 * Incremental analysis pipeline that adds new responses to existing clusters
 * Does not regenerate themes or change existing response assignments
 * Follows SRP: orchestrates incremental update flow
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createOpenAIClient, generateEmbeddings } from "@/lib/analysis/openai/embeddingsClient";
import { detectOutliers, computeMADZScores } from "../domain/outlierDetection";
import {
  MISC_CLUSTER_INDEX,
  OUTLIER_Z_THRESHOLD,
  OUTLIER_MIN_CLUSTER_SIZE,
  OUTLIER_MAX_RATIO,
} from "../domain/thresholds";

interface ResponseData {
  id: string;
  text: string;
  userId: string;
  createdAt: string;
}

interface ClusterModel {
  clusterIndex: number;
  centroidEmbedding: number[];
  centroidXUmap: number;
  centroidYUmap: number;
  spreadRadius: number;
  clusterSize?: number; // Track existing cluster size for outlier detection
}

/**
 * Run incremental analysis pipeline for a conversation
 * Only processes new responses since last analysis
 * Assigns them to existing clusters and places on existing 2D map
 *
 * @param supabase - Supabase client
 * @param conversationId - Conversation UUID
 * @throws Error if analysis fails at any stage
 */
export async function runConversationAnalysisIncremental(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  console.log(
    `[runConversationAnalysisIncremental] Starting incremental analysis for ${conversationId}`
  );

  try {
    // 1. Update status to 'embedding'
    await updateAnalysisStatus(supabase, conversationId, "embedding");

    // 2. Fetch analysis baseline timestamp
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("analysis_updated_at, analysis_response_count")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error("Conversation not found");
    }

    const baselineTimestamp = conversation.analysis_updated_at;
    const baselineCount = conversation.analysis_response_count ?? 0;

    console.log(
      `[runConversationAnalysisIncremental] Baseline: ${baselineCount} responses at ${baselineTimestamp}`
    );

    // 3. Fetch new responses only
    let query = supabase
      .from("conversation_responses")
      .select("id, response_text, user_id, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    // Filter by timestamp if available, otherwise by missing cluster assignment
    if (baselineTimestamp) {
      query = query.gt("created_at", baselineTimestamp);
    } else {
      query = query.is("cluster_index", null);
    }

    const { data: newResponsesData, error: responsesError } = await query;

    if (responsesError) {
      throw new Error(`Failed to fetch new responses: ${responsesError.message}`);
    }

    const newResponses: ResponseData[] =
      newResponsesData?.map((row: { id: string; response_text: string; user_id: string; created_at: string }) => ({
        id: row.id,
        text: row.response_text,
        userId: row.user_id,
        createdAt: row.created_at,
      })) ?? [];

    if (newResponses.length === 0) {
      console.log(
        `[runConversationAnalysisIncremental] No new responses to process`
      );
      await updateAnalysisStatus(supabase, conversationId, "ready");
      return;
    }

    console.log(
      `[runConversationAnalysisIncremental] Processing ${newResponses.length} new responses`
    );

    // 4. Load cluster models
    const clusterModels = await loadClusterModels(supabase, conversationId);

    if (clusterModels.length === 0) {
      throw new Error("No cluster models found - prerequisites missing");
    }

    console.log(
      `[runConversationAnalysisIncremental] Loaded ${clusterModels.length} cluster models`
    );

    // 5. Generate embeddings for new responses
    const openai = createOpenAIClient();
    const texts = newResponses.map((r) => r.text);
    const rawEmbeddings = await generateEmbeddings(openai, texts);

    // Normalize embeddings to unit length
    const embeddings = normalizeEmbeddings(rawEmbeddings);

    console.log(
      `[runConversationAnalysisIncremental] Generated ${embeddings.length} embeddings`
    );

    // 6. Update status to 'analyzing'
    await updateAnalysisStatus(supabase, conversationId, "analyzing");

    // 7. Assign each new response to nearest cluster
    const { assignments, distances } = assignToNearestCluster(embeddings, clusterModels);

    console.log(
      `[runConversationAnalysisIncremental] Assigned responses to clusters`
    );

    // 7a. Detect outliers per cluster
    const outlierScores = new Array<number | null>(assignments.length).fill(null);

    // Group new responses by assigned cluster
    const responsesByCluster = new Map<number, number[]>();
    for (let i = 0; i < assignments.length; i++) {
      const clusterIdx = assignments[i];
      if (!responsesByCluster.has(clusterIdx)) {
        responsesByCluster.set(clusterIdx, []);
      }
      responsesByCluster.get(clusterIdx)!.push(i);
    }

    // Detect outliers per cluster
    let miscCount = 0;
    for (const [clusterIdx, responseIndices] of responsesByCluster.entries()) {
      const clusterModel = clusterModels.find(m => m.clusterIndex === clusterIdx);
      const clusterSize = (clusterModel?.clusterSize ?? 0) + responseIndices.length;

      // Skip if cluster too small
      if (clusterSize < OUTLIER_MIN_CLUSTER_SIZE) continue;

      // Get distances for this cluster
      const clusterDistances = responseIndices.map(i => distances[i]);

      // Compute z-scores for this cluster
      const zScores = computeMADZScores(clusterDistances);

      // Detect outliers
      const isOutlier = detectOutliers(clusterDistances, {
        threshold: OUTLIER_Z_THRESHOLD,
        minClusterSize: OUTLIER_MIN_CLUSTER_SIZE,
        maxOutlierRatio: OUTLIER_MAX_RATIO,
      });

      // Mark outliers and reassign to misc
      for (let j = 0; j < responseIndices.length; j++) {
        const responseIdx = responseIndices[j];
        outlierScores[responseIdx] = zScores[j];

        if (isOutlier[j]) {
          assignments[responseIdx] = MISC_CLUSTER_INDEX;
          miscCount++;
        }
      }
    }

    console.log(
      `[runConversationAnalysisIncremental] Detected ${miscCount} outliers among new responses`
    );

    // 8. Place each new response on 2D map with jitter
    const coordinates = placeOnMap(assignments, clusterModels);

    console.log(
      `[runConversationAnalysisIncremental] Placed responses on 2D map`
    );

    // 9. Update response rows with coordinates, cluster indices, and outlier data
    for (let i = 0; i < newResponses.length; i++) {
      const { error } = await supabase
        .from("conversation_responses")
        .update({
          x_umap: coordinates[i][0],
          y_umap: coordinates[i][1],
          cluster_index: assignments[i],
          distance_to_centroid: distances[i],
          outlier_score: outlierScores[i],
          is_misc: assignments[i] === MISC_CLUSTER_INDEX,
        })
        .eq("id", newResponses[i].id);

      if (error) {
        console.error(
          `[runConversationAnalysisIncremental] Failed to update response ${i + 1}/${newResponses.length}:`,
          error
        );
        throw new Error(
          `Failed to update response ${newResponses[i].id}: ${error.message}`
        );
      }

      // Log progress every 50 responses
      if ((i + 1) % 50 === 0) {
        console.log(
          `[runConversationAnalysisIncremental] Updated ${i + 1}/${newResponses.length} responses`
        );
      }
    }

    console.log(
      `[runConversationAnalysisIncremental] Successfully updated all ${newResponses.length} responses`
    );

    // 10. Update theme sizes (recount by cluster)
    await updateThemeSizes(supabase, conversationId);

    // 11. Get final response count
    const { count: finalCount, error: countError } = await supabase
      .from("conversation_responses")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (countError) {
      throw new Error(`Failed to count responses: ${countError.message}`);
    }

    // 12. Update status to 'ready' with tracking metadata
    await updateAnalysisStatus(supabase, conversationId, "ready");
    await supabase
      .from("conversations")
      .update({
        analysis_response_count: finalCount ?? 0,
        analysis_updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    console.log(
      `[runConversationAnalysisIncremental] Incremental analysis complete for ${conversationId}`
    );
  } catch (error) {
    console.error(
      `[runConversationAnalysisIncremental] Failed for ${conversationId}:`,
      error
    );

    // Update status to 'error'
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    await updateAnalysisStatus(supabase, conversationId, "error", errorMessage);

    throw error;
  }
}

/**
 * Load cluster models from database
 * Also fetches existing cluster sizes for outlier detection
 */
async function loadClusterModels(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ClusterModel[]> {
  const { data, error } = await supabase
    .from("conversation_cluster_models")
    .select(
      "cluster_index, centroid_embedding, centroid_x_umap, centroid_y_umap, spread_radius"
    )
    .eq("conversation_id", conversationId)
    .order("cluster_index", { ascending: true });

  if (error) {
    throw new Error(`Failed to load cluster models: ${error.message}`);
  }

  // Fetch existing cluster sizes (exclude misc and null)
  const { data: sizesData, error: sizesError } = await supabase
    .from("conversation_responses")
    .select("cluster_index")
    .eq("conversation_id", conversationId)
    .not("cluster_index", "is", null)
    .neq("cluster_index", MISC_CLUSTER_INDEX);

  if (sizesError) {
    throw new Error(`Failed to fetch cluster sizes: ${sizesError.message}`);
  }

  // Count responses per cluster
  const clusterSizes = new Map<number, number>();
  for (const row of sizesData ?? []) {
    const idx = (row as { cluster_index: number }).cluster_index;
    clusterSizes.set(idx, (clusterSizes.get(idx) ?? 0) + 1);
  }

  return (
    data?.map(
      (row: {
        cluster_index: number;
        centroid_embedding: number[];
        centroid_x_umap: number;
        centroid_y_umap: number;
        spread_radius: number;
      }) => ({
        clusterIndex: row.cluster_index,
        centroidEmbedding: row.centroid_embedding,
        centroidXUmap: row.centroid_x_umap,
        centroidYUmap: row.centroid_y_umap,
        spreadRadius: row.spread_radius,
        clusterSize: clusterSizes.get(row.cluster_index) ?? 0,
      })
    ) ?? []
  );
}

/**
 * Assign embeddings to nearest cluster using cosine distance
 * Returns both assignments and distances for outlier detection
 */
function assignToNearestCluster(
  embeddings: number[][],
  clusterModels: ClusterModel[]
): { assignments: number[]; distances: number[] } {
  const assignments: number[] = [];
  const distances: number[] = [];

  for (const embedding of embeddings) {
    let bestCluster = 0;
    let bestDistance = Infinity;

    for (const model of clusterModels) {
      const distance = cosineDistance(embedding, model.centroidEmbedding);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCluster = model.clusterIndex;
      }
    }

    assignments.push(bestCluster);
    distances.push(bestDistance);
  }

  return { assignments, distances };
}

/**
 * Place responses on 2D map using cluster centroids + jitter
 * Misc points are placed at the origin with jitter for visibility
 */
function placeOnMap(
  assignments: number[],
  clusterModels: ClusterModel[]
): number[][] {
  const clusterMap = new Map<number, ClusterModel>();
  for (const model of clusterModels) {
    clusterMap.set(model.clusterIndex, model);
  }

  return assignments.map((clusterIdx) => {
    // Handle MISC_CLUSTER_INDEX (no model for outliers)
    if (clusterIdx === MISC_CLUSTER_INDEX) {
      // Place at origin with random jitter for visibility
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * 0.5; // Small spread
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      return [x, y];
    }

    const model = clusterMap.get(clusterIdx);
    if (!model) {
      throw new Error(`Cluster model not found for index ${clusterIdx}`);
    }

    // Add deterministic jitter based on cluster spread
    const angle = Math.random() * 2 * Math.PI;
    const radius = Math.random() * model.spreadRadius;
    const x = model.centroidXUmap + radius * Math.cos(angle);
    const y = model.centroidYUmap + radius * Math.sin(angle);

    return [x, y];
  });
}

/**
 * Update theme sizes by recounting cluster members
 * Creates or updates "Misc" theme if outliers exist
 */
async function updateThemeSizes(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  // Fetch current cluster sizes (including misc)
  const { data: clusterCounts, error: countError } = await supabase
    .from("conversation_responses")
    .select("cluster_index")
    .eq("conversation_id", conversationId)
    .not("cluster_index", "is", null);

  if (countError) {
    throw new Error(`Failed to count clusters: ${countError.message}`);
  }

  // Count by cluster
  const sizesMap = new Map<number, number>();
  for (const row of clusterCounts ?? []) {
    const idx = (row as { cluster_index: number }).cluster_index;
    sizesMap.set(idx, (sizesMap.get(idx) ?? 0) + 1);
  }

  // Update each theme row
  for (const [clusterIdx, size] of sizesMap.entries()) {
    if (clusterIdx === MISC_CLUSTER_INDEX) {
      // Upsert misc theme
      await supabase
        .from("conversation_themes")
        .upsert({
          conversation_id: conversationId,
          cluster_index: MISC_CLUSTER_INDEX,
          name: "Misc",
          description: "Responses that don't fit well into other themes",
          size,
        });
    } else {
      // Update regular theme
      await supabase
        .from("conversation_themes")
        .update({ size })
        .eq("conversation_id", conversationId)
        .eq("cluster_index", clusterIdx);
    }
  }

  console.log(
    `[updateThemeSizes] Updated ${sizesMap.size} theme sizes`
  );
}

/**
 * Update conversation analysis status
 */
async function updateAnalysisStatus(
  supabase: SupabaseClient,
  conversationId: string,
  status: "embedding" | "analyzing" | "ready" | "error",
  errorMessage?: string
): Promise<void> {
  const update: {
    analysis_status: string;
    analysis_error?: string | null;
  } = {
    analysis_status: status,
  };

  if (status === "error" && errorMessage) {
    update.analysis_error = errorMessage;
  } else if (status === "ready") {
    update.analysis_error = null;
  }

  const { error } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", conversationId);

  if (error) {
    console.error(`[updateAnalysisStatus] Failed to update status:`, error);
  }
}

/**
 * Normalize embeddings to unit length
 */
function normalizeEmbeddings(embeddings: number[][]): number[][] {
  return embeddings.map((embedding) => {
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    if (magnitude === 0) return embedding;
    return embedding.map((val) => val / magnitude);
  });
}

/**
 * Calculate cosine distance between two vectors
 * Returns 1 - cosine_similarity (0 = identical, 2 = opposite)
 */
function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same length");
  }

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) {
    return 2; // maximum distance
  }

  const cosineSimilarity = dotProduct / (magA * magB);
  return 1 - cosineSimilarity;
}
