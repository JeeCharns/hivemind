/**
 * Run Analysis in Background - Fire-and-forget analysis execution
 *
 * Executes conversation analysis in the background without blocking the API response.
 * This uses the server secret key (admin client) so analysis persistence is not blocked by RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { claimAnalysisJob } from "./claimAnalysisJob";

const ANALYSIS_JOB_LOCK_TTL_MS = 15 * 60 * 1000;

/**
 * Trigger analysis to run in the background without waiting for completion
 *
 * @param conversationId - Conversation UUID
 * @param jobId - Analysis job ID to process
 * @param strategy - Analysis strategy ("incremental" or "full")
 */
export async function runAnalysisInBackground(
  supabase: SupabaseClient,
  conversationId: string,
  jobId: string,
  strategy: "incremental" | "full"
): Promise<void> {
  const admin = supabaseAdminClient();

  console.log("[runAnalysisInBackground] Starting background analysis:", {
    conversationId,
    jobId,
    strategy,
  });

  Promise.resolve()
    .then(async () => {
      let jobClaimed = false;

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
          (jobClaimed ? "" : " (running without job tracking due to table visibility issue)")
        );

        const { runConversationAnalysis } = await import("./runConversationAnalysis");
        const { runConversationAnalysisIncremental } = await import(
          "./runConversationAnalysisIncremental"
        );

        if (strategy === "incremental") {
          await runConversationAnalysisIncremental(admin, conversationId);
        } else {
          await runConversationAnalysis(admin, conversationId);
        }

        // Only try to update job status if we successfully claimed it
        if (jobClaimed) {
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
    })
    .catch((err) => {
      console.error("[runAnalysisInBackground] Fatal error:", err);
    });
}
