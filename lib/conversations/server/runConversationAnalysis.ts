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
    const embeddings = await generateEmbeddings(openai, texts);

    console.log(`[runConversationAnalysis] Generated ${embeddings.length} embeddings`);

    // 4. Update status to 'analyzing'
    await updateAnalysisStatus(supabase, conversationId, "analyzing");

    // 5. Reduce dimensions for visualization
    const coordinates = reduceToTwoD(embeddings);

    console.log(`[runConversationAnalysis] Reduced to 2D coordinates`);

    // 6. Cluster embeddings
    const clusterIndices = clusterEmbeddings(embeddings);

    console.log(`[runConversationAnalysis] Clustered into ${new Set(clusterIndices).size} groups`);

    // 7. Group responses by cluster
    const responsesByCluster = new Map<number, string[]>();
    for (let i = 0; i < responses.length; i++) {
      const clusterIdx = clusterIndices[i];
      if (!responsesByCluster.has(clusterIdx)) {
        responsesByCluster.set(clusterIdx, []);
      }
      responsesByCluster.get(clusterIdx)!.push(texts[i]);
    }

    // 8. Generate themes
    const themes = await generateThemes(openai, responsesByCluster);

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

    // 10. Update status to 'ready'
    await updateAnalysisStatus(supabase, conversationId, "ready");

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
    .select("id, text")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch responses: ${error.message}`);
  }

  return data || [];
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
  const update: any = {
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
  const responseUpdates = responses.map((response, i) => ({
    id: response.id,
    x: coordinates[i][0],
    y: coordinates[i][1],
    cluster_index: clusterIndices[i],
  }));

  // Batch update responses (Supabase upsert)
  for (let i = 0; i < responseUpdates.length; i += 100) {
    const batch = responseUpdates.slice(i, i + 100);

    const { error } = await supabase
      .from("conversation_responses")
      .upsert(batch, { onConflict: "id" });

    if (error) {
      throw new Error(`Failed to update responses: ${error.message}`);
    }
  }

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
