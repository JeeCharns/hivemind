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
    const clusterIndices = relabelClustersBySize(rawClusterIndices);

    console.log(`[runConversationAnalysis] Clustered into ${new Set(clusterIndices).size} groups`);

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
      // Sample diverse responses (spread across original order)
      const sampledTexts = sampleDiverseResponses(texts, originalIndices, 20);
      themesInput.set(clusterIdx, sampledTexts);
    }
    const themes = await generateThemes(openai, themesInput);

    console.log(`[runConversationAnalysis] Generated ${themes.length} themes`);

    // 9. Save results to database
    await saveAnalysisResults(
      supabase,
      conversationId,
      responses,
      coordinates,
      clusterIndices,
      themes
    );

    // 10. Update status to 'ready' with tracking metadata
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
  themes: Theme[]
): Promise<void> {
  // 1. Update responses with coordinates and cluster indices
  // Use sequential updates to avoid overwhelming Supabase connections
  // This is more reliable than parallel updates for large batches
  for (let i = 0; i < responses.length; i++) {
    const { error } = await supabase
      .from("conversation_responses")
      .update({
        x_umap: coordinates[i][0],
        y_umap: coordinates[i][1],
        cluster_index: clusterIndices[i],
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
