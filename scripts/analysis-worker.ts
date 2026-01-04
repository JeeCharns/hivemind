/**
 * Conversation Analysis Worker
 *
 * Background worker that processes queued analysis jobs
 * Follows CLAUDE.md principles:
 * - SRP: Single responsibility of job processing
 * - Dependency injection for testability
 * - Robust error handling with retries
 * - Comprehensive logging
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runConversationAnalysis } from "../lib/conversations/server/runConversationAnalysis";
import { runConversationAnalysisIncremental } from "../lib/conversations/server/runConversationAnalysisIncremental";
import winston from "winston";
import { claimAnalysisJob } from "../lib/conversations/server/claimAnalysisJob";

// Configuration
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "3", 10);
const WORKER_ID = process.env.WORKER_ID || `worker-${Math.random().toString(36).substring(7)}`;
const JOB_LOCK_TTL_MS = parseInt(process.env.JOB_LOCK_TTL_MS || "900000", 10); // 15 minutes

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "analysis-worker", workerId: WORKER_ID },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

/**
 * Initialize Supabase client
 */
function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Missing required environment variables: (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL) and SUPABASE_SECRET_KEY"
    );
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Fetch next queued job
 * Uses RPC to bypass PostgREST schema cache issues
 */
async function fetchNextJob(supabase: ReturnType<typeof createSupabaseClient>) {
  const cutoff = new Date(Date.now() - JOB_LOCK_TTL_MS).toISOString();

  // Try RPC first (bypasses PostgREST schema cache)
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "fetch_next_analysis_job",
    { p_cutoff: cutoff }
  );

  if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
    return rpcData[0];
  }

  if (rpcError) {
    logger.warn("RPC fetch failed, falling back to REST API", {
      error: rpcError.message,
      code: rpcError.code,
    });
  }

  // Fallback to REST API
  const { data, error } = await supabase
    .from("conversation_analysis_jobs")
    .select("*")
    .or(
      [
        "status.eq.queued",
        "and(status.eq.running,locked_at.is.null)",
        `and(status.eq.running,locked_at.lt.${cutoff})`,
      ].join(",")
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows returned
    logger.error("Failed to fetch job", { error: error.message });
    return null;
  }

  return data;
}

/**
 * Mark job as succeeded
 */
async function markJobSucceeded(
  supabase: ReturnType<typeof createSupabaseClient>,
  jobId: string
): Promise<void> {
  const { error } = await supabase
    .from("conversation_analysis_jobs")
    .update({
      status: "succeeded",
      updated_at: new Date().toISOString(),
      locked_at: null,
    })
    .eq("id", jobId);

  if (error) {
    logger.error("Failed to mark job as succeeded", {
      jobId,
      error: error.message,
    });
  }
}

/**
 * Mark job as failed
 */
async function markJobFailed(
  supabase: ReturnType<typeof createSupabaseClient>,
  jobId: string,
  errorMessage: string,
  attempts: number
): Promise<void> {
  const newStatus = attempts >= MAX_RETRIES ? "failed" : "queued";

  const { error } = await supabase
    .from("conversation_analysis_jobs")
    .update({
      status: newStatus,
      last_error: errorMessage,
      attempts: attempts + 1,
      updated_at: new Date().toISOString(),
      locked_at: null, // Release lock
    })
    .eq("id", jobId);

  if (error) {
    logger.error("Failed to mark job as failed", {
      jobId,
      error: error.message,
    });
  }
}

/**
 * Process a single job
 */
async function processJob(
  supabase: ReturnType<typeof createSupabaseClient>,
  job: {
    id: string;
    conversation_id: string;
    attempts: number;
    strategy: "full" | "incremental";
  }
): Promise<void> {
  const { id: jobId, conversation_id: conversationId, attempts, strategy } = job;

  logger.info("Processing job", { jobId, conversationId, attempts, strategy });

  try {
    const claim = await claimAnalysisJob(supabase, {
      jobId,
      lockTtlMs: JOB_LOCK_TTL_MS,
    });
    if (!claim.claimed) {
      logger.warn("Job not claimed (already running or not queued)", {
        jobId,
        conversationId,
      });
      return;
    }

    // Run analysis (branch on strategy)
    if (strategy === "incremental") {
      await runConversationAnalysisIncremental(supabase, conversationId);
    } else {
      await runConversationAnalysis(supabase, conversationId);
    }

    // Mark as succeeded
    await markJobSucceeded(supabase, jobId);

    logger.info("Job completed successfully", { jobId, conversationId, strategy });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logger.error("Job processing failed", {
      jobId,
      conversationId,
      attempts,
      strategy,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Check if this is a PostgREST schema cache issue
    const isSchemaError =
      errorMessage.includes("PostgREST") &&
      errorMessage.includes("schema cache");

    if (isSchemaError) {
      logger.warn("PostgREST schema cache error detected", {
        jobId,
        conversationId,
        suggestion: "Run: SELECT pg_notify('pgrst', 'reload schema');",
      });

      // For schema errors, check if the analysis actually completed
      const { data: conv } = await supabase
        .from("conversations")
        .select("analysis_status")
        .eq("id", conversationId)
        .maybeSingle();

      if (conv?.analysis_status === "ready" || conv?.analysis_status === "completed") {
        logger.info("Analysis already completed despite job error", {
          jobId,
          conversationId,
          analysisStatus: conv.analysis_status,
        });

        // Try to mark as succeeded, but don't fail if we can't
        try {
          await markJobSucceeded(supabase, jobId);
          logger.info("Marked job as succeeded after detecting completed analysis", {
            jobId,
            conversationId,
          });
          return; // Exit early, don't retry
        } catch {
          logger.warn("Could not update job status, but analysis is complete", {
            jobId,
            conversationId,
          });
          return; // Exit early anyway, analysis is done
        }
      }
    }

    // Mark as failed (will retry if under MAX_RETRIES)
    await markJobFailed(supabase, jobId, errorMessage, attempts);

    if (attempts + 1 >= MAX_RETRIES) {
      logger.error("Job exceeded max retries", {
        jobId,
        conversationId,
        maxRetries: MAX_RETRIES,
      });
    }
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  logger.info("Analysis worker starting", {
    workerId: WORKER_ID,
    pollInterval: POLL_INTERVAL_MS,
    maxRetries: MAX_RETRIES,
  });

  const supabase = createSupabaseClient();

  // Graceful shutdown
  let shouldStop = false;
  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down gracefully");
    shouldStop = true;
  });
  process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down gracefully");
    shouldStop = true;
  });

  while (!shouldStop) {
    try {
      // Fetch next job
      const job = await fetchNextJob(supabase);

      if (job) {
        // Process job
        await processJob(supabase, job);
      } else {
        // No jobs available, wait before polling again
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      logger.error("Worker loop error", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Back off on error
      await sleep(POLL_INTERVAL_MS * 2);
    }
  }

  logger.info("Worker stopped");
  process.exit(0);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    logger.error("Worker crashed", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });
}

export { runWorker };
