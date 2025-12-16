/**
 * Enqueue Conversation Analysis Service
 *
 * Server-side business logic for queuing conversation analysis jobs
 * Follows SRP: single responsibility of job queueing
 * Provides idempotency and concurrency safety
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriggerAnalysisResponse } from "../schemas";

/**
 * Enqueue a conversation analysis job
 *
 * Uses conversation_analysis_jobs table to prevent duplicate jobs
 * Returns status indicating whether job was queued or already running/complete
 *
 * @param supabase - Supabase client with auth
 * @param conversationId - Conversation UUID to analyze
 * @param userId - User requesting the analysis
 * @returns Analysis job status
 * @throws Error if conversation not found or operation fails
 */
export async function enqueueConversationAnalysis(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<TriggerAnalysisResponse> {
  // Fetch conversation to validate it exists
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, analysis_status")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) {
    throw new Error("Conversation not found");
  }

  // If analysis is already complete, return early
  if (conversation.analysis_status === "ready") {
    return { status: "already_complete" };
  }

  // Try to insert a new job record
  // The unique constraint on (conversation_id, status) where status IN ('queued', 'running')
  // will prevent duplicate jobs
  const { error: insertError } = await supabase
    .from("conversation_analysis_jobs")
    .insert({
      conversation_id: conversationId,
      status: "queued",
      created_by: userId,
      attempts: 0,
    });

  // If insert failed due to unique constraint, job already exists
  if (insertError) {
    if (insertError.code === "23505") {
      // unique_violation
      return { status: "already_running" };
    }

    console.error("[enqueueConversationAnalysis] Insert failed:", insertError);
    throw new Error("Failed to enqueue analysis job");
  }

  // Update conversation status to indicate analysis has been queued
  await supabase
    .from("conversations")
    .update({
      analysis_status: "not_started",
    })
    .eq("id", conversationId);

  return { status: "queued" };
}
