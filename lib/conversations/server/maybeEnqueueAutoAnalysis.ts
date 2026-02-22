/**
 * Maybe Enqueue Auto Analysis Service
 *
 * Server-side service for auto-triggering analysis at 20 responses
 * Follows SRP: single responsibility of determining when to auto-trigger
 * Provides idempotency and avoids duplicate analysis
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueConversationAnalysis } from "./enqueueConversationAnalysis";

export interface AutoAnalysisResult {
  triggered: boolean;
  status: "queued" | "already_running" | "already_complete" | "skipped";
  reason?: string;
  /** Job ID if status is "queued" - caller must schedule background execution */
  jobId?: string;
  /** Strategy used if status is "queued" */
  strategy?: "incremental" | "full";
}

export interface AutoAnalysisOptions {
  threshold?: number;
}

/**
 * Maybe enqueue analysis for a conversation if it meets threshold
 *
 * Rules:
 * - Only triggers for "understand" type conversations
 * - Only triggers when response count >= threshold (default 20)
 * - Skips if analysis is already fresh (ready + response_count >= current count)
 * - Uses existing enqueueConversationAnalysis for idempotent queueing
 *
 * @param supabase - Supabase client with auth
 * @param conversationId - Conversation UUID
 * @param userId - User ID for job creation
 * @param opts - Options (threshold)
 * @returns Result indicating whether analysis was triggered
 */
export async function maybeEnqueueAutoAnalysis(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  opts?: AutoAnalysisOptions
): Promise<AutoAnalysisResult> {
  const threshold = opts?.threshold ?? 20;

  // 1. Fetch conversation with current analysis state
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, type, analysis_status, analysis_response_count")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    console.error(
      `[maybeEnqueueAutoAnalysis] Conversation not found: ${conversationId}`
    );
    return {
      triggered: false,
      status: "skipped",
      reason: "conversation_not_found",
    };
  }

  // 2. Only trigger for "understand" conversations
  if (conversation.type !== "understand") {
    return {
      triggered: false,
      status: "skipped",
      reason: "wrong_conversation_type",
    };
  }

  // 3. Count current responses (cheap count query)
  const { count, error: countError } = await supabase
    .from("conversation_responses")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if (countError || count === null) {
    console.error(
      `[maybeEnqueueAutoAnalysis] Failed to count responses:`,
      countError
    );
    return {
      triggered: false,
      status: "skipped",
      reason: "count_failed",
    };
  }

  // 4. Check if response count meets threshold
  if (count < threshold) {
    return {
      triggered: false,
      status: "skipped",
      reason: "below_threshold",
    };
  }

  // 5. Check if analysis is already fresh enough
  if (
    conversation.analysis_status === "ready" &&
    conversation.analysis_response_count !== null &&
    conversation.analysis_response_count >= count
  ) {
    return {
      triggered: false,
      status: "already_complete",
      reason: "analysis_already_fresh",
    };
  }

  // 6. Enqueue analysis (idempotent)
  try {
    const result = await enqueueConversationAnalysis(
      supabase,
      conversationId,
      userId
    );

    // Map enqueue result to auto-analysis result
    if (result.status === "queued") {
      return {
        triggered: true,
        status: "queued",
        jobId: result.jobId,
        strategy: result.strategy,
      };
    } else if (result.status === "already_running") {
      return {
        triggered: false,
        status: "already_running",
      };
    } else {
      // already_complete
      return {
        triggered: false,
        status: "already_complete",
      };
    }
  } catch (error) {
    console.error(`[maybeEnqueueAutoAnalysis] Failed to enqueue:`, error);
    return {
      triggered: false,
      status: "skipped",
      reason: "enqueue_failed",
    };
  }
}
