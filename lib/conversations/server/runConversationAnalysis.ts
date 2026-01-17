/**
 * Run Conversation Analysis
 *
 * Main orchestrator for conversation analysis pipeline
 * Follows SRP: orchestrates the analysis flow
 * All dependencies injected for testability
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createOpenAIClient, generateEmbeddings } from "@/lib/analysis/openai/embeddingsClient";
import { reduceToTwoD } from "@/lib/analysis/clustering/dimensionReduction";
import { clusterEmbeddings } from "@/lib/analysis/clustering/kmeans";
import { generateThemes, type Theme } from "@/lib/analysis/openai/themeGenerator";
import { groupResponsesBySimilarity, DEFAULT_GROUPING_PARAMS } from "../domain/similarityGrouping";
import { saveResponseEmbeddings } from "./saveResponseEmbeddings";
import { saveResponseGroups } from "./saveResponseGroups";
import { consolidateClusters, type ClusterResponse } from "@/lib/analysis/openai/clusterConsolidator";
import { saveClusterConsolidation } from "./saveClusterConsolidation";
import { computeMADZScores, detectOutliersPerCluster } from "../domain/outlierDetection";
import {
  MISC_CLUSTER_INDEX,
  OUTLIER_Z_THRESHOLD,
  OUTLIER_MIN_CLUSTER_SIZE,
  OUTLIER_MAX_RATIO,
} from "../domain/thresholds";
import { enforceMinClusters } from "../domain/clusterEnforcement";

interface ResponseData {
  id: string;
  text: string;
  userId: string;
}

/**
 * Run complete analysis pipeline for a conversation
 *
 * @param supabase - Supabase client
 * @param conversationId - Conversation UUID
 * @throws Error if analysis fails at any stage
 */
export async function runConversationAnalysis(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  console.log(`[runConversationAnalysis] Starting analysis for ${conversationId}`);

  try {
    // 1. Update status to 'embedding'
    await updateAnalysisStatus(supabase, conversationId, "embedding");

    // 2. Fetch responses
    const responses = await fetchResponses(supabase, conversationId);

    if (responses.length === 0) {
      console.log(`[runConversationAnalysis] No responses to analyze`);
      await updateAnalysisStatus(supabase, conversationId, "ready");
      return;
    }

    console.log(`[runConversationAnalysis] Analyzing ${responses.length} responses`);

    // 3. Generate embeddings
    const openai = createOpenAIClient();
    const texts = responses.map((r) => r.text);
    const rawEmbeddings = await generateEmbeddings(openai, texts);

    // Normalize embeddings to unit length for better clustering
    const embeddings = normalizeEmbeddings(rawEmbeddings);

    console.log(`[runConversationAnalysis] Generated ${embeddings.length} embeddings`);

    // 4. Update status to 'analyzing'
    await updateAnalysisStatus(supabase, conversationId, "analyzing");

    // 5. Reduce dimensions for visualization
    const coordinates = reduceToTwoD(embeddings);

    console.log(`[runConversationAnalysis] Reduced to 2D coordinates`);

    // 6. Cluster embeddings
    const rawClusterIndices = clusterEmbeddings(embeddings);

    // Relabel clusters by size (largest = 0, next = 1, etc.) for stable UX
    let clusterIndices = relabelClustersBySize(rawClusterIndices);

    // Log initial cluster distribution
    let clusterSizes = new Map<number, number>();
    for (const idx of clusterIndices) {
      clusterSizes.set(idx, (clusterSizes.get(idx) || 0) + 1);
    }
    let sortedSizes = Array.from(clusterSizes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([idx, size]) => `cluster ${idx}: ${size}`)
      .slice(0, 10); // Top 10 clusters

    console.log(
      `[runConversationAnalysis] Clustered into ${clusterSizes.size} groups (${sortedSizes.join(", ")}${clusterSizes.size > 10 ? ", ..." : ""})`
    );

    // 6a. Enforce minimum cluster floor via post-processing splits
    const enforcementResult = enforceMinClusters(
      embeddings,
      clusterIndices,
      responses.length
    );

    clusterIndices = enforcementResult.clusterIndices;

    // Log enforcement results
    if (enforcementResult.splitsPerformed > 0) {
      console.log(
        `[runConversationAnalysis] Enforced minimum cluster floor: ` +
        `target=${enforcementResult.targetMinClusters}, ` +
        `effective=${enforcementResult.effectiveMinClusters}, ` +
        `splits=${enforcementResult.splitsPerformed}, ` +
        `final=${enforcementResult.finalClusterCount}`
      );
    } else if (enforcementResult.reason) {
      console.log(
        `[runConversationAnalysis] Minimum cluster floor check: ${enforcementResult.reason}`
      );
    }

    // Update cluster distribution after enforcement
    clusterSizes = new Map<number, number>();
    for (const idx of clusterIndices) {
      clusterSizes.set(idx, (clusterSizes.get(idx) || 0) + 1);
    }
    sortedSizes = Array.from(clusterSizes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([idx, size]) => `cluster ${idx}: ${size}`)
      .slice(0, 10); // Top 10 clusters

    // 6b. Compute cluster centroids in embedding space
    const clusterCentroids = computeClusterCentroids(embeddings, clusterIndices);

    // 6c. Compute distances to centroids for outlier detection
    const distancesToCentroids = computeDistancesToCentroids(
      embeddings,
      clusterIndices,
      clusterCentroids
    );

    // 6d. Compute outlier scores (MAD-based z-scores)
    const outlierScores = computeOutlierScores(clusterIndices, distancesToCentroids);

    // 6e. Detect outliers per cluster
    const outlierMap = detectOutliersPerCluster(
      clusterIndices,
      distancesToCentroids,
      {
        threshold: OUTLIER_Z_THRESHOLD,
        minClusterSize: OUTLIER_MIN_CLUSTER_SIZE,
        maxOutlierRatio: OUTLIER_MAX_RATIO,
      }
    );

    // 6f. Reassign outliers to MISC_CLUSTER_INDEX
    let miscCount = 0;
    for (const [, outlierIndices] of outlierMap.entries()) {
      for (const responseIdx of outlierIndices) {
        clusterIndices[responseIdx] = MISC_CLUSTER_INDEX;
        miscCount++;
      }
    }

    console.log(
      `[runConversationAnalysis] Detected ${miscCount} outliers across ${outlierMap.size} clusters`
    );

    // Log if outlier reassignment reduced cluster count below target
    if (enforcementResult.splitsPerformed > 0) {
      const finalNonMiscCount = clusterIndices.filter(
        (idx) => idx !== MISC_CLUSTER_INDEX
      ).reduce((set, idx) => set.add(idx), new Set()).size;
      if (finalNonMiscCount < enforcementResult.effectiveMinClusters) {
        console.log(
          `[runConversationAnalysis] Warning: outlier reassignment reduced cluster count to ${finalNonMiscCount} ` +
          `(below target ${enforcementResult.effectiveMinClusters})`
        );
      }
    }

    // 7. Group responses by cluster with diverse sampling
    const responsesByCluster = new Map<number, { texts: string[]; originalIndices: number[] }>();
    for (let i = 0; i < responses.length; i++) {
      const clusterIdx = clusterIndices[i];
      if (!responsesByCluster.has(clusterIdx)) {
        responsesByCluster.set(clusterIdx, { texts: [], originalIndices: [] });
      }
      const cluster = responsesByCluster.get(clusterIdx)!;
      cluster.texts.push(texts[i]);
      cluster.originalIndices.push(i);
    }

    // 8. Generate themes with diverse sampling
    const themesInput = new Map<number, string[]>();
    for (const [clusterIdx, { texts, originalIndices }] of responsesByCluster.entries()) {
      // Skip MISC_CLUSTER_INDEX for LLM theme generation
      if (clusterIdx === MISC_CLUSTER_INDEX) continue;

      // Sample diverse responses (spread across original order)
      const sampledTexts = sampleDiverseResponses(texts, originalIndices, 20);
      themesInput.set(clusterIdx, sampledTexts);
    }
    const themes = await generateThemes(openai, themesInput);

    // Add hardcoded "Misc" theme if outliers exist
    if (miscCount > 0) {
      themes.push({
        clusterIndex: MISC_CLUSTER_INDEX,
        name: "Misc",
        description: "Responses that don't fit well into other themes",
        size: miscCount,
      });
    }

    console.log(`[runConversationAnalysis] Generated ${themes.length} themes (including ${miscCount > 0 ? 1 : 0} misc theme)`);

    // 9. Save results to database
    await saveAnalysisResults(
      supabase,
      conversationId,
      responses,
      coordinates,
      clusterIndices,
      distancesToCentroids,
      outlierScores,
      themes
    );

    // 10. Persist cluster models for incremental updates
    await saveClusterModels(
      supabase,
      conversationId,
      embeddings,
      coordinates,
      clusterIndices
    );

    // 11. Persist embeddings for similarity grouping
    await saveResponseEmbeddings(supabase, conversationId, responses, embeddings);

    // 12. Compute and save "frequently mentioned" groups
    const responsesWithEmbeddings = responses.map((r, i) => ({
      id: r.id,
      text: r.text,
      embedding: embeddings[i],
      clusterIndex: clusterIndices[i],
    }));

    const groups = groupResponsesBySimilarity(
      responsesWithEmbeddings,
      DEFAULT_GROUPING_PARAMS
    );

    await saveResponseGroups(supabase, conversationId, groups, DEFAULT_GROUPING_PARAMS);

    console.log(`[runConversationAnalysis] Created ${groups.length} frequently mentioned groups`);

    // 12a. Consolidate clusters using LLM-driven semantic bucketing
    // Build map of cluster index to responses (excluding misc/outliers)
    const clusterResponses = new Map<number, ClusterResponse[]>();
    for (let i = 0; i < responses.length; i++) {
      const clusterIndex = clusterIndices[i];
      // Skip misc/outlier responses (cluster index -1)
      if (clusterIndex === MISC_CLUSTER_INDEX) continue;

      if (!clusterResponses.has(clusterIndex)) {
        clusterResponses.set(clusterIndex, []);
      }
      clusterResponses.get(clusterIndex)!.push({
        id: String(responses[i].id), // Ensure string for consistent comparison
        text: responses[i].text,
      });
    }

    if (clusterResponses.size > 0) {
      console.log(
        `[runConversationAnalysis] Consolidating ${clusterResponses.size} clusters`
      );

      const consolidationResults = await consolidateClusters(openai, clusterResponses);
      await saveClusterConsolidation(supabase, conversationId, consolidationResults);

      console.log(
        `[runConversationAnalysis] Saved cluster consolidation for ${consolidationResults.length} clusters`
      );
    }

    // 13. Update status to 'ready' with tracking metadata
    await updateAnalysisStatus(supabase, conversationId, "ready");
    await supabase
      .from("conversations")
      .update({
        analysis_response_count: responses.length,
        analysis_updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    console.log(`[runConversationAnalysis] Analysis complete for ${conversationId}`);
  } catch (error) {
    console.error(`[runConversationAnalysis] Failed for ${conversationId}:`, error);

    // Update status to 'error'
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    await updateAnalysisStatus(supabase, conversationId, "error", errorMessage);

    throw error;
  }
}

/**
 * Fetch responses for a conversation
 */
async function fetchResponses(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ResponseData[]> {
  const { data, error } = await supabase
    .from("conversation_responses")
    .select("id, response_text, user_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch responses: ${error.message}`);
  }

  return (
    (
      data as
        | Array<{ id: string; response_text: string; user_id: string }>
        | null
    )?.map(
      (row) => ({
        id: row.id,
        text: row.response_text,
        userId: row.user_id,
      })
    ) ?? []
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
    analysis_response_count?: number;
    analysis_updated_at?: string;
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
 * Save analysis results to database
 */
async function saveAnalysisResults(
  supabase: SupabaseClient,
  conversationId: string,
  responses: ResponseData[],
  coordinates: number[][],
  clusterIndices: number[],
  distancesToCentroids: number[],
  outlierScores: (number | null)[],
  themes: Theme[]
): Promise<void> {
  // 1. Update responses with coordinates, cluster indices, and outlier data
  // Use sequential updates to avoid overwhelming Supabase connections
  // This is more reliable than parallel updates for large batches
  for (let i = 0; i < responses.length; i++) {
    const { error } = await supabase
      .from("conversation_responses")
      .update({
        x_umap: coordinates[i][0],
        y_umap: coordinates[i][1],
        cluster_index: clusterIndices[i],
        distance_to_centroid: distancesToCentroids[i],
        outlier_score: outlierScores[i],
        is_misc: clusterIndices[i] === MISC_CLUSTER_INDEX,
      })
      .eq("id", responses[i].id);

    if (error) {
      console.error(
        `[runConversationAnalysis] Failed to update response ${i + 1}/${responses.length}:`,
        error
      );
      throw new Error(
        `Failed to update response ${responses[i].id}: ${error.message} (code: ${error.code})`
      );
    }

    // Log progress every 50 responses
    if ((i + 1) % 50 === 0) {
      console.log(
        `[runConversationAnalysis] Updated ${i + 1}/${responses.length} responses`
      );
    }
  }

  console.log(
    `[runConversationAnalysis] Successfully updated all ${responses.length} responses`
  );

  // 2. Delete existing themes
  await supabase
    .from("conversation_themes")
    .delete()
    .eq("conversation_id", conversationId);

  // 3. Insert new themes
  if (themes.length > 0) {
    const themeRows = themes.map((theme) => ({
      conversation_id: conversationId,
      cluster_index: theme.clusterIndex,
      name: theme.name,
      description: theme.description,
      size: theme.size,
    }));

    const { error } = await supabase
      .from("conversation_themes")
      .insert(themeRows);

    if (error) {
      throw new Error(`Failed to insert themes: ${error.message}`);
    }
  }
}

/**
 * Normalize embeddings to unit length
 *
 * @param embeddings - Array of embedding vectors
 * @returns Normalized embeddings
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
 * Relabel clusters by size (largest = 0, next = 1, etc.)
 *
 * @param clusterIndices - Original cluster assignments
 * @returns Relabeled cluster indices
 */
function relabelClustersBySize(clusterIndices: number[]): number[] {
  // Count cluster sizes
  const clusterSizes = new Map<number, number>();
  for (const idx of clusterIndices) {
    clusterSizes.set(idx, (clusterSizes.get(idx) || 0) + 1);
  }

  // Sort clusters by size (descending)
  const sortedClusters = Array.from(clusterSizes.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([idx]) => idx);

  // Create mapping from old to new indices
  const relabelMap = new Map<number, number>();
  sortedClusters.forEach((oldIdx, newIdx) => {
    relabelMap.set(oldIdx, newIdx);
  });

  // Apply relabeling
  return clusterIndices.map((idx) => relabelMap.get(idx) ?? idx);
}

/**
 * Sample diverse responses from a cluster
 * Spreads samples across the original order for diversity
 *
 * @param texts - Response texts in cluster
 * @param originalIndices - Original response indices
 * @param maxSamples - Maximum number of samples
 * @returns Sampled response texts
 */
function sampleDiverseResponses(
  texts: string[],
  originalIndices: number[],
  maxSamples: number
): string[] {
  if (texts.length <= maxSamples) {
    return texts;
  }

  // Create array of [text, originalIndex] pairs
  const pairs = texts.map((text, i) => ({
    text,
    originalIndex: originalIndices[i],
  }));

  // Sort by original index
  pairs.sort((a, b) => a.originalIndex - b.originalIndex);

  // Take evenly spaced samples
  const step = texts.length / maxSamples;
  const samples: string[] = [];
  for (let i = 0; i < maxSamples; i++) {
    const idx = Math.floor(i * step);
    samples.push(pairs[idx].text);
  }

  return samples;
}

/**
 * Save cluster models for incremental updates
 * Computes cluster centroids in embedding space and 2D space
 *
 * @param supabase - Supabase client
 * @param conversationId - Conversation UUID
 * @param embeddings - All response embeddings
 * @param coordinates - All 2D coordinates
 * @param clusterIndices - Cluster assignments
 */
async function saveClusterModels(
  supabase: SupabaseClient,
  conversationId: string,
  embeddings: number[][],
  coordinates: number[][],
  clusterIndices: number[]
): Promise<void> {
  // Group by cluster
  const clusterData = new Map<
    number,
    { embeddings: number[][]; coords: number[][] }
  >();

  for (let i = 0; i < clusterIndices.length; i++) {
    const clusterIdx = clusterIndices[i];

    // Skip MISC_CLUSTER_INDEX (no centroid model for outliers)
    if (clusterIdx === MISC_CLUSTER_INDEX) continue;

    if (!clusterData.has(clusterIdx)) {
      clusterData.set(clusterIdx, { embeddings: [], coords: [] });
    }
    const cluster = clusterData.get(clusterIdx)!;
    cluster.embeddings.push(embeddings[i]);
    cluster.coords.push(coordinates[i]);
  }

  // Delete existing models
  await supabase
    .from("conversation_cluster_models")
    .delete()
    .eq("conversation_id", conversationId);

  // Compute centroids and stats for each cluster
  const models = [];
  for (const [clusterIdx, { embeddings: clusterEmbeddings, coords }] of clusterData.entries()) {
    // Compute centroid in embedding space
    const centroidEmbedding = computeCentroid(clusterEmbeddings);

    // Compute centroid in 2D space
    const centroidX =
      coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
    const centroidY =
      coords.reduce((sum, c) => sum + c[1], 0) / coords.length;

    // Compute spread radius (max distance from centroid)
    let maxRadius = 0;
    for (const [x, y] of coords) {
      const dist = Math.sqrt((x - centroidX) ** 2 + (y - centroidY) ** 2);
      maxRadius = Math.max(maxRadius, dist);
    }

    // Add 10% padding to spread radius
    const spreadRadius = maxRadius * 1.1 || 0.1;

    models.push({
      conversation_id: conversationId,
      cluster_index: clusterIdx,
      centroid_embedding: centroidEmbedding,
      centroid_x_umap: centroidX,
      centroid_y_umap: centroidY,
      spread_radius: spreadRadius,
      updated_at: new Date().toISOString(),
    });
  }

  // Insert new models
  if (models.length > 0) {
    const { error } = await supabase
      .from("conversation_cluster_models")
      .insert(models);

    if (error) {
      console.error("[saveClusterModels] Failed to save models:", error);
      throw new Error(`Failed to save cluster models: ${error.message}`);
    }
  }

  console.log(`[saveClusterModels] Saved ${models.length} cluster models`);
}

/**
 * Compute centroid of a set of vectors
 */
function computeCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error("Cannot compute centroid of empty set");
  }

  const dim = vectors[0].length;
  const centroid = new Array(dim).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += vector[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] /= vectors.length;
  }

  return centroid;
}

/**
 * Compute cluster centroids in embedding space
 * Groups embeddings by cluster and computes mean for each
 */
function computeClusterCentroids(
  embeddings: number[][],
  clusterIndices: number[]
): Map<number, number[]> {
  // Group embeddings by cluster
  const clusterEmbeddings = new Map<number, number[][]>();
  for (let i = 0; i < embeddings.length; i++) {
    const clusterIdx = clusterIndices[i];
    if (!clusterEmbeddings.has(clusterIdx)) {
      clusterEmbeddings.set(clusterIdx, []);
    }
    clusterEmbeddings.get(clusterIdx)!.push(embeddings[i]);
  }

  // Compute centroid for each cluster
  const centroids = new Map<number, number[]>();
  for (const [clusterIdx, embeds] of clusterEmbeddings.entries()) {
    centroids.set(clusterIdx, computeCentroid(embeds));
  }

  return centroids;
}

/**
 * Compute cosine distance between two vectors
 * Returns 0 for identical vectors, 2 for opposite vectors
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

  // Handle zero vectors
  if (magA === 0 || magB === 0) return 2;

  const cosineSimilarity = dotProduct / (magA * magB);
  return 1 - cosineSimilarity;
}

/**
 * Compute distances from each response to its assigned centroid
 */
function computeDistancesToCentroids(
  embeddings: number[][],
  clusterIndices: number[],
  centroids: Map<number, number[]>
): number[] {
  return embeddings.map((embedding, i) => {
    const clusterIdx = clusterIndices[i];
    const centroid = centroids.get(clusterIdx);
    if (!centroid) return 0;
    return cosineDistance(embedding, centroid);
  });
}

/**
 * Compute MAD-based z-scores for outlier detection
 * Returns array of outlier scores (null for responses in small clusters)
 */
function computeOutlierScores(
  clusterIndices: number[],
  distancesToCentroids: number[]
): (number | null)[] {
  // Group distances by cluster
  const clusterDistances = new Map<number, Array<{ idx: number; distance: number }>>();
  for (let i = 0; i < clusterIndices.length; i++) {
    const clusterIdx = clusterIndices[i];
    if (!clusterDistances.has(clusterIdx)) {
      clusterDistances.set(clusterIdx, []);
    }
    clusterDistances.get(clusterIdx)!.push({ idx: i, distance: distancesToCentroids[i] });
  }

  // Compute z-scores per cluster
  const outlierScores = new Array<number | null>(clusterIndices.length).fill(null);

  for (const [, entries] of clusterDistances.entries()) {
    // Skip small clusters
    if (entries.length < OUTLIER_MIN_CLUSTER_SIZE) continue;

    const distances = entries.map(e => e.distance);
    const zScores = computeMADZScores(distances);

    for (let j = 0; j < entries.length; j++) {
      outlierScores[entries[j].idx] = zScores[j];
    }
  }

  return outlierScores;
}
