/**
 * Run Queued Analysis Job
 *
 * Manually execute a queued analysis job.
 * This is useful when the automatic background execution isn't working.
 *
 * Usage: npx tsx scripts/run-queued-job.ts <job-id>
 */

import { createClient } from "@supabase/supabase-js";
import { claimAnalysisJob } from "../lib/conversations/server/claimAnalysisJob";
import { runConversationAnalysis } from "../lib/conversations/server/runConversationAnalysis";
import { runConversationAnalysisIncremental } from "../lib/conversations/server/runConversationAnalysisIncremental";

const jobId = process.argv[2];

if (!jobId) {
  console.error("Usage: npx tsx scripts/run-queued-job.ts <job-id>");
  process.exit(1);
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    "Missing required environment variables: (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL) and SUPABASE_SECRET_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function main() {
  console.log(`\n🚀 Running analysis job: ${jobId}\n`);

  // 1. Fetch job details
  const { data: job, error: jobError } = await supabase
    .from("conversation_analysis_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobError) {
    console.error("❌ Error fetching job:", jobError);
    process.exit(1);
  }

  console.log(`📋 Job details:`);
  console.log(`   Conversation ID: ${job.conversation_id}`);
  console.log(`   Status: ${job.status}`);
  console.log(`   Strategy: ${job.strategy}`);
  console.log(`   Attempts: ${job.attempts}\n`);

  if (job.status !== "queued") {
    console.log(
      `⚠️  Job is not in 'queued' status. Current status: ${job.status}`
    );
    console.log(
      `   Continue anyway? This will run the analysis regardless of status.`
    );
  }

  // 2. Claim the job
  console.log("🔒 Claiming job...");
  const claim = await claimAnalysisJob(supabase, {
    jobId: job.id,
    lockTtlMs: 15 * 60 * 1000, // 15 minutes
  });

  if (!claim.claimed) {
    console.error("❌ Could not claim job (already running or not queued)");
    process.exit(1);
  }

  console.log("✅ Job claimed!\n");

  // 3. Run analysis
  console.log(
    `📊 Starting ${job.strategy} analysis for conversation ${job.conversation_id}...`
  );
  console.log(`   This may take a few minutes...\n`);

  try {
    if (job.strategy === "incremental") {
      await runConversationAnalysisIncremental(supabase, job.conversation_id);
    } else {
      await runConversationAnalysis(supabase, job.conversation_id);
    }

    // 4. Mark job as succeeded
    const { error: updateError } = await supabase
      .from("conversation_analysis_jobs")
      .update({
        status: "succeeded",
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateError) {
      console.warn("⚠️  Could not update job status:", updateError);
    } else {
      console.log("✅ Marked job as succeeded");
    }

    console.log("\n✨ Analysis completed successfully!\n");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Analysis failed:", errorMessage);

    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }

    // Mark job as failed
    const { error: updateError } = await supabase
      .from("conversation_analysis_jobs")
      .update({
        status: "failed",
        last_error: errorMessage,
        locked_at: null,
        attempts: job.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateError) {
      console.warn("⚠️  Could not update job status:", updateError);
    } else {
      console.log("✅ Marked job as failed");
    }

    process.exit(1);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
  });
