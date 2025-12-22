/**
 * Trigger Conversation Analysis Service
 *
 * Orchestrates analysis triggering with intelligent strategy selection
 * Decides between incremental and full re-analysis based on staleness
 * Follows SRP: single responsibility of analysis decision + enqueue
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriggerAnalysisRequest, TriggerAnalysisResponse } from "../schemas";
import { UNDERSTAND_MIN_RESPONSES, INCREMENTAL_THRESHOLD } from "../domain/thresholds";

/**
 * Trigger conversation analysis with intelligent strategy selection
 *
 * Strategy logic:
 * - fresh (ready + count >= analyzed): return already_complete
 * - stale + newCount < 10 + prerequisites exist: incremental
 * - stale + newCount >= 10: full
 * - stale + missing prerequisites: full
 *
 * @param supabase - Supabase client with auth
 * @param conversationId - Conversation UUID
 * @param userId - User requesting the analysis
 * @param request - Request options (mode, strategy)
 * @returns Analysis job status with strategy metadata
 * @throws Error if conversation not found or unauthorized
 */
export async function triggerConversationAnalysis(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  request: TriggerAnalysisRequest
): Promise<TriggerAnalysisResponse> {
  console.log(
    `[triggerConversationAnalysis] conversationId=${conversationId} mode=${request.mode} strategy=${request.strategy}`
  );

  // 1. Fetch conversation with metadata
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, hive_id, type, analysis_status, analysis_response_count, analysis_updated_at")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) {
    throw new Error("Conversation not found");
  }

  // 2. Verify hive membership (authz boundary)
  const { data: membership, error: membershipError } = await supabase
    .from("hive_members")
    .select("user_id")
    .eq("hive_id", conversation.hive_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("Unauthorized: not a hive member");
  }

  // 3. Count current responses
  const { count: currentCount, error: countError } = await supabase
    .from("conversation_responses")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if (countError || currentCount === null) {
    throw new Error("Failed to count responses");
  }

  // 4. Check if conversation type supports analysis
  if (conversation.type !== "understand") {
    return {
      status: "already_complete",
      reason: "wrong_type",
      currentResponseCount: currentCount,
      analysisResponseCount: conversation.analysis_response_count,
    };
  }

  // 5. Check if below threshold
  if (currentCount < UNDERSTAND_MIN_RESPONSES) {
    return {
      status: "already_complete",
      reason: "below_threshold",
      currentResponseCount: currentCount,
      analysisResponseCount: conversation.analysis_response_count,
    };
  }

  // 6. Calculate staleness
  const analyzedCount = conversation.analysis_response_count ?? 0;
  const newCount = Math.max(0, currentCount - analyzedCount);
  const isFresh =
    conversation.analysis_status === "ready" && analyzedCount >= currentCount;
  const isStale =
    conversation.analysis_status === "ready" && analyzedCount < currentCount;

  console.log(
    `[triggerConversationAnalysis] currentCount=${currentCount} analyzedCount=${analyzedCount} newCount=${newCount} isFresh=${isFresh} isStale=${isStale}`
  );

  // 7. If fresh, no-op
  if (isFresh) {
    return {
      status: "already_complete",
      reason: "fresh",
      currentResponseCount: currentCount,
      analysisResponseCount: conversation.analysis_response_count,
      newResponsesSinceAnalysis: newCount,
    };
  }

  // 8. Check if analysis is already in progress
  if (
    conversation.analysis_status &&
    ["embedding", "analyzing", "not_started"].includes(conversation.analysis_status)
  ) {
    return {
      status: "already_running",
      reason: "in_progress",
      currentResponseCount: currentCount,
      analysisResponseCount: conversation.analysis_response_count,
      newResponsesSinceAnalysis: newCount,
    };
  }

  // 9. Decide strategy
  let chosenStrategy: "incremental" | "full" = "full";

  if (request.strategy === "full") {
    chosenStrategy = "full";
  } else if (request.strategy === "incremental") {
    chosenStrategy = "incremental";
  } else {
    // auto mode
    if (isStale && newCount < INCREMENTAL_THRESHOLD) {
      // Check prerequisites for incremental
      const hasPrereqs = await checkIncrementalPrerequisites(
        supabase,
        conversationId
      );

      if (hasPrereqs) {
        chosenStrategy = "incremental";
      } else {
        chosenStrategy = "full";
        console.log(
          `[triggerConversationAnalysis] Missing prerequisites, falling back to full`
        );
      }
    } else {
      chosenStrategy = "full";
    }
  }

  console.log(
    `[triggerConversationAnalysis] strategy=${chosenStrategy} newCount=${newCount}`
  );

  // 10. Enqueue job
  console.log("[triggerConversationAnalysis] Creating analysis job with status=queued");

  const { data: insertedJob, error: insertError } = await supabase
    .from("conversation_analysis_jobs")
    .insert({
      conversation_id: conversationId,
      status: "queued",
      created_by: userId,
      attempts: 0,
      strategy: chosenStrategy,
    })
    .select("id")
    .single();

  console.log("[triggerConversationAnalysis] Job insert result:", {
    hasData: !!insertedJob,
    jobId: insertedJob?.id,
    hasError: !!insertError,
    errorCode: insertError?.code,
    errorMessage: insertError?.message,
  });

  // If insert failed due to unique constraint, job already exists
  if (insertError) {
    if (insertError.code === "23505") {
      // unique_violation
      return {
        status: "already_running",
        reason: "in_progress",
        strategy: chosenStrategy,
        currentResponseCount: currentCount,
        analysisResponseCount: conversation.analysis_response_count,
        newResponsesSinceAnalysis: newCount,
      };
    }

    console.error("[triggerConversationAnalysis] Insert failed:", insertError);
    throw new Error("Failed to enqueue analysis job");
  }

  if (!insertedJob) {
    throw new Error("Failed to create analysis job");
  }

  // DEBUG: Verify the job was created with the correct columns
  const { data: verifyJob, error: verifyError } = await supabase
    .from("conversation_analysis_jobs")
    .select("id, status, locked_at, created_at")
    .eq("id", insertedJob.id)
    .single();

  console.log("[triggerConversationAnalysis] Job verification (SELECT after INSERT):", {
    hasData: !!verifyJob,
    hasError: !!verifyError,
    errorCode: verifyError?.code,
    errorMessage: verifyError?.message,
    jobData: verifyJob,
  });

  // 11. Update conversation status
  await supabase
    .from("conversations")
    .update({
      analysis_status: "not_started",
    })
    .eq("id", conversationId);

  // 12. Trigger background execution immediately (fire-and-forget)
  // Import dynamically to avoid loading unless needed
  const { runAnalysisInBackground } = await import("./runAnalysisInBackground");
  runAnalysisInBackground(supabase, conversationId, insertedJob.id, chosenStrategy);

  return {
    status: "queued",
    strategy: chosenStrategy,
    reason: isStale ? "stale" : undefined,
    currentResponseCount: currentCount,
    analysisResponseCount: conversation.analysis_response_count,
    newResponsesSinceAnalysis: newCount,
  };
}

/**
 * Check if prerequisites exist for incremental analysis
 *
 * Prerequisites:
 * - conversation_cluster_models table has entries for this conversation
 *
 * @param supabase - Supabase client
 * @param conversationId - Conversation UUID
 * @returns True if prerequisites exist
 */
async function checkIncrementalPrerequisites(
  supabase: SupabaseClient,
  conversationId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("conversation_cluster_models")
    .select("conversation_id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if (error) {
    console.error(
      "[checkIncrementalPrerequisites] Failed to check models:",
      error
    );
    return false;
  }

  return (count ?? 0) > 0;
}
