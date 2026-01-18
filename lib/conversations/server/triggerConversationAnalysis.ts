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

interface TriggerConversationAnalysisOptions {
  requireAdmin?: boolean;
}

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
 * @param options - Optional authorization controls
 * @returns Analysis job status with strategy metadata
 * @throws Error if conversation not found or unauthorized
 */
export async function triggerConversationAnalysis(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  request: TriggerAnalysisRequest,
  options?: TriggerConversationAnalysisOptions
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
    .select("user_id, role")
    .eq("hive_id", conversation.hive_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("Unauthorized: not a hive member");
  }

  if (options?.requireAdmin && membership.role !== "admin") {
    throw new Error("Unauthorized: Admin access required");
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

  // 7. If fresh, no-op (unless regenerate mode, which forces re-analysis)
  if (isFresh && request.mode !== "regenerate") {
    return {
      status: "already_complete",
      reason: "fresh",
      currentResponseCount: currentCount,
      analysisResponseCount: conversation.analysis_response_count,
      newResponsesSinceAnalysis: newCount,
    };
  }

  // 8. Check if analysis job is already queued/running
  // Check the jobs table for active jobs, not just the conversation status
  const { data: existingJobs, error: jobsError } = await supabase
    .from("conversation_analysis_jobs")
    .select("id, status, created_at, locked_at")
    .eq("conversation_id", conversationId)
    .in("status", ["queued", "running"])
    .limit(1);

  if (jobsError) {
    console.error("[triggerConversationAnalysis] Failed to check existing jobs:", jobsError);
    // Continue anyway - we'll try to create the job
  }

  // Stale job threshold: 1 hour for queued jobs, 30 minutes for running jobs
  const STALE_QUEUED_MS = 60 * 60 * 1000; // 1 hour
  const STALE_RUNNING_MS = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();

  if (existingJobs && existingJobs.length > 0) {
    const existingJob = existingJobs[0];
    const jobCreatedAt = new Date(existingJob.created_at).getTime();
    const jobAge = now - jobCreatedAt;

    // Determine if job is stale based on status
    const staleThreshold =
      existingJob.status === "queued" ? STALE_QUEUED_MS : STALE_RUNNING_MS;
    const isJobStale = jobAge > staleThreshold;

    console.log(
      `[triggerConversationAnalysis] Job already exists with status=${existingJob.status} age=${Math.round(jobAge / 1000)}s isStale=${isJobStale}`
    );

    // For regenerate mode with a stale job, we should retire it and continue
    // For normal mode with a stale job, we should also allow retry (job likely stuck)
    if (isJobStale) {
      console.log(
        `[triggerConversationAnalysis] Retiring stale job ${existingJob.id} (age=${Math.round(jobAge / 60000)} minutes)`
      );

      const { error: retireError } = await supabase
        .from("conversation_analysis_jobs")
        .update({
          status: "failed",
          last_error: `stale_job_retired (age=${Math.round(jobAge / 60000)}min, mode=${request.mode})`,
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingJob.id)
        .in("status", ["queued", "running"]); // Safety: only update if still active

      if (retireError) {
        console.error(
          "[triggerConversationAnalysis] Failed to retire stale job:",
          retireError
        );
        // Continue anyway - the unique constraint will catch duplicates
      }
      // Continue to create a new job below
    } else if (request.mode === "regenerate") {
      // For regenerate mode with a non-stale job, still allow override
      // This handles the case where user explicitly wants to restart
      console.log(
        `[triggerConversationAnalysis] Regenerate mode: retiring active job ${existingJob.id}`
      );

      const { error: retireError } = await supabase
        .from("conversation_analysis_jobs")
        .update({
          status: "failed",
          last_error: "superseded by regenerate request",
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingJob.id)
        .in("status", ["queued", "running"]);

      if (retireError) {
        console.error(
          "[triggerConversationAnalysis] Failed to retire job for regenerate:",
          retireError
        );
      }
      // Continue to create a new job below
    } else {
      // Non-stale job exists and not regenerate mode - block the request
      return {
        status: "already_running",
        reason: "in_progress",
        currentResponseCount: currentCount,
        analysisResponseCount: conversation.analysis_response_count,
        newResponsesSinceAnalysis: newCount,
      };
    }
  }

  // 9. Decide strategy
  // Regenerate mode with auto strategy defaults to full for complete re-analysis
  let chosenStrategy: "incremental" | "full" = "full";

  if (request.strategy === "full") {
    chosenStrategy = "full";
  } else if (request.strategy === "incremental") {
    chosenStrategy = "incremental";
  } else {
    // auto mode - regenerate defaults to full, manual uses threshold logic
    if (request.mode === "regenerate") {
      chosenStrategy = "full";
    } else if (isStale && newCount < INCREMENTAL_THRESHOLD) {
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
  // Note: Active jobs are already retired in step 8 above (for stale jobs or regenerate mode)
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

  // If insert failed, handle the error
  if (insertError) {
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

  // 12. Update conversation status
  await supabase
    .from("conversations")
    .update({
      analysis_status: "not_started",
    })
    .eq("id", conversationId);

  // 13. Return job info - caller is responsible for scheduling background execution
  // This allows the API route to use Next.js after() for proper serverless lifecycle management
  return {
    status: "queued",
    strategy: chosenStrategy,
    reason: isStale ? "stale" : undefined,
    currentResponseCount: currentCount,
    analysisResponseCount: conversation.analysis_response_count,
    newResponsesSinceAnalysis: newCount,
    jobId: insertedJob.id,
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
