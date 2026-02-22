/**
 * Run Analysis in Background - Awaitable analysis execution
 *
 * Executes conversation analysis. Designed to be used with Next.js after() API
 * for proper serverless lifecycle management. This uses the server secret key
 * (admin client) so analysis persistence is not blocked by RLS.
 */

import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { claimAnalysisJob } from "./claimAnalysisJob";

const ANALYSIS_JOB_LOCK_TTL_MS = 15 * 60 * 1000;

/**
 * Execute analysis for a queued job
 *
 * This function is designed to be called from Next.js after() to ensure
 * the serverless function stays alive until the analysis completes.
 *
 * @param conversationId - Conversation UUID
 * @param jobId - Analysis job ID to process
 * @param strategy - Analysis strategy ("incremental" or "full")
 */
export async function runAnalysisInBackground(
  conversationId: string,
  jobId: string,
  strategy: "incremental" | "full"
): Promise<void> {
  const admin = supabaseAdminClient();
  let jobClaimed = false;

  console.log("[runAnalysisInBackground] Starting analysis:", {
    conversationId,
    jobId,
    strategy,
  });

  try {
    console.log("[runAnalysisInBackground] Claiming job with ADMIN client...");

    try {
      const claim = await claimAnalysisJob(admin, {
        jobId,
        lockTtlMs: ANALYSIS_JOB_LOCK_TTL_MS,
      });

      if (!claim.claimed) {
        console.log(
          `[runAnalysisInBackground] Job already claimed or not queued: jobId=${jobId} conversationId=${conversationId}`
        );
        return;
      }

      jobClaimed = true;
    } catch (err) {
      const claimError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        "[runAnalysisInBackground] ⚠️  Could not claim job via normal path (PostgREST table issue), proceeding anyway:",
        claimError.message
      );
      // Continue execution - we'll run the analysis but won't be able to update job status
      jobClaimed = false;
    }

    console.log(
      `[runAnalysisInBackground] Starting ${strategy} analysis for conversation ${conversationId}` +
        (jobClaimed
          ? ""
          : " (running without job tracking due to table visibility issue)")
    );

    const { runConversationAnalysis } =
      await import("./runConversationAnalysis");
    const { runConversationAnalysisIncremental } =
      await import("./runConversationAnalysisIncremental");

    if (strategy === "incremental") {
      await runConversationAnalysisIncremental(admin, conversationId);
    } else {
      await runConversationAnalysis(admin, conversationId);
    }

    // Only try to update job status if we successfully claimed it
    if (jobClaimed) {
      // Worker safety: verify job is still active before persisting results
      // This prevents a superseded job from overwriting newer analysis
      const { data: jobCheck } = await admin
        .from("conversation_analysis_jobs")
        .select("status")
        .eq("id", jobId)
        .single();

      if (jobCheck && jobCheck.status === "running") {
        const successUpdate = await admin
          .from("conversation_analysis_jobs")
          .update({
            status: "succeeded",
            locked_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);

        if (successUpdate.error) {
          console.warn(
            "[runAnalysisInBackground] Could not update job status to succeeded (table visibility issue):",
            successUpdate.error.message
          );
        }
      } else {
        console.log(
          `[runAnalysisInBackground] Job ${jobId} was superseded (status=${jobCheck?.status}), discarding results`
        );
        return; // Exit without persisting results
      }
    } else {
      console.log(
        "[runAnalysisInBackground] Skipping job status update (job table not accessible via PostgREST)"
      );
    }

    console.log(
      `[runAnalysisInBackground] Completed ${strategy} analysis for conversation ${conversationId}`
    );
  } catch (error) {
    console.error(
      `[runAnalysisInBackground] Error for conversation ${conversationId}:`,
      error
    );

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Only try to update job status if we successfully claimed it
    if (jobClaimed) {
      const failureUpdate = await admin
        .from("conversation_analysis_jobs")
        .update({
          status: "failed",
          last_error: errorMessage,
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (failureUpdate.error) {
        console.warn(
          "[runAnalysisInBackground] Could not update job status to failed (table visibility issue):",
          failureUpdate.error.message
        );
      }
    } else {
      console.log(
        "[runAnalysisInBackground] Skipping job failure update (job table not accessible via PostgREST)"
      );
    }

    await admin
      .from("conversations")
      .update({
        analysis_status: "error",
        analysis_error: errorMessage,
      })
      .eq("id", conversationId);
  }
}
