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

import { createClient } from "@supabase/supabase-js";
import { runConversationAnalysis } from "../lib/conversations/server/runConversationAnalysis";
import winston from "winston";

// Configuration
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "3", 10);
const WORKER_ID = process.env.WORKER_ID || `worker-${Math.random().toString(36).substring(7)}`;

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
function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Fetch next queued job
 */
async function fetchNextJob(supabase: ReturnType<typeof createSupabaseClient>) {
  const { data, error } = await supabase
    .from("conversation_analysis_jobs")
    .select("*")
    .eq("status", "queued")
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
 * Lock a job for processing
 */
async function lockJob(
  supabase: ReturnType<typeof createSupabaseClient>,
  jobId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("conversation_analysis_jobs")
    .update({
      status: "running",
      locked_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "queued"); // Only lock if still queued (prevent race condition)

  if (error) {
    logger.error("Failed to lock job", { jobId, error: error.message });
    return false;
  }

  return true;
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
  job: any
): Promise<void> {
  const { id: jobId, conversation_id: conversationId, attempts } = job;

  logger.info("Processing job", { jobId, conversationId, attempts });

  try {
    // Lock the job
    const locked = await lockJob(supabase, jobId);
    if (!locked) {
      logger.warn("Failed to lock job (race condition)", { jobId });
      return;
    }

    // Run analysis
    await runConversationAnalysis(supabase, conversationId);

    // Mark as succeeded
    await markJobSucceeded(supabase, jobId);

    logger.info("Job completed successfully", { jobId, conversationId });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logger.error("Job processing failed", {
      jobId,
      conversationId,
      attempts,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

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
