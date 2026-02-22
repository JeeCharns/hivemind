/**
 * Reset Stuck Analysis Job
 *
 * Manually reset a stuck analysis job and optionally restart analysis.
 * Usage: npx tsx scripts/reset-stuck-job.ts <conversation-id> [--restart]
 */

import { createClient } from "@supabase/supabase-js";

const conversationId = process.argv[2];
const shouldRestart = process.argv.includes("--restart");

if (!conversationId) {
  console.error(
    "Usage: npx tsx scripts/reset-stuck-job.ts <conversation-id> [--restart]"
  );
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
  console.log(`\n🔍 Checking conversation: ${conversationId}\n`);

  // 1. Check current job status
  const { data: jobs, error: jobsError } = await supabase
    .from("conversation_analysis_jobs")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (jobsError) {
    console.error("❌ Error fetching jobs:", jobsError);
    process.exit(1);
  }

  console.log(`📋 Found ${jobs?.length || 0} job(s):\n`);
  jobs?.forEach((job, idx) => {
    console.log(`Job ${idx + 1}:`);
    console.log(`  ID: ${job.id}`);
    console.log(`  Status: ${job.status}`);
    console.log(`  Strategy: ${job.strategy}`);
    console.log(`  Attempts: ${job.attempts}`);
    console.log(`  Created: ${job.created_at}`);
    console.log(`  Updated: ${job.updated_at}`);
    console.log(`  Locked: ${job.locked_at || "N/A"}`);
    console.log(`  Error: ${job.last_error || "N/A"}`);
    console.log();
  });

  // 2. Check conversation status
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("analysis_status, analysis_response_count, created_by")
    .eq("id", conversationId)
    .single();

  if (convError) {
    console.error("❌ Error fetching conversation:", convError);
    process.exit(1);
  }

  console.log(`📊 Conversation status:`);
  console.log(`  Analysis status: ${conversation.analysis_status}`);
  console.log(
    `  Analysis response count: ${conversation.analysis_response_count || "N/A"}\n`
  );

  // 3. Count current responses
  const { count: responseCount, error: countError } = await supabase
    .from("responses")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if (countError) {
    console.error("❌ Error counting responses:", countError);
    process.exit(1);
  }

  console.log(`💬 Current response count: ${responseCount}\n`);

  // 4. Find stuck running jobs
  const stuckJobs = jobs?.filter((job) => job.status === "running") || [];

  if (stuckJobs.length === 0) {
    console.log("✅ No stuck jobs found.");

    if (shouldRestart) {
      console.log("\n🔄 Restarting analysis (creating new job)...");
      await restartAnalysis();
    }
    return;
  }

  console.log(
    `⚠️  Found ${stuckJobs.length} stuck job(s) in 'running' status\n`
  );

  // 5. Reset stuck jobs
  console.log("🔧 Resetting stuck jobs to 'failed' status...\n");

  for (const job of stuckJobs) {
    const { error: updateError } = await supabase
      .from("conversation_analysis_jobs")
      .update({
        status: "failed",
        last_error: "manually reset - job was stuck",
        updated_at: new Date().toISOString(),
        locked_at: null,
      })
      .eq("id", job.id);

    if (updateError) {
      console.error(`❌ Error resetting job ${job.id}:`, updateError);
    } else {
      console.log(`✅ Reset job ${job.id}`);
    }
  }

  // 6. Reset conversation status if needed
  if (
    conversation.analysis_status === "embedding" ||
    conversation.analysis_status === "analyzing"
  ) {
    console.log(
      "\n🔧 Resetting conversation analysis status to 'not_started'..."
    );

    const { error: convUpdateError } = await supabase
      .from("conversations")
      .update({
        analysis_status: "not_started",
      })
      .eq("id", conversationId);

    if (convUpdateError) {
      console.error("❌ Error resetting conversation:", convUpdateError);
    } else {
      console.log("✅ Reset conversation status");
    }
  }

  // 7. Optionally restart analysis
  if (shouldRestart) {
    console.log("\n🔄 Restarting analysis (creating new job)...");
    await restartAnalysis();
  } else {
    console.log("\n💡 To restart analysis, run:");
    console.log(
      `   npx tsx scripts/reset-stuck-job.ts ${conversationId} --restart`
    );
    console.log(
      "\n   Or trigger from the UI (Understand tab > Generate/Regenerate button)"
    );
  }
}

async function restartAnalysis() {
  // Get conversation to find created_by
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select("created_by")
    .eq("id", conversationId)
    .single();

  if (convError) {
    console.error("❌ Error fetching conversation:", convError);
    return;
  }

  // Create a new job
  const { data: newJob, error: createError } = await supabase
    .from("conversation_analysis_jobs")
    .insert({
      conversation_id: conversationId,
      created_by: conv.created_by,
      status: "queued",
      strategy: "full",
      attempts: 0,
    })
    .select()
    .single();

  if (createError) {
    console.error("❌ Error creating new job:", createError);
    return;
  }

  console.log(`✅ Created new job: ${newJob.id}`);

  // Update conversation status
  const { error: convUpdateError } = await supabase
    .from("conversations")
    .update({
      analysis_status: "embedding",
    })
    .eq("id", conversationId);

  if (convUpdateError) {
    console.error("❌ Error updating conversation:", convUpdateError);
    return;
  }

  console.log("✅ Updated conversation status to 'embedding'");
  console.log("\n🚀 Analysis restarted! Check status with:");
  console.log(
    `   curl http://localhost:3000/api/conversations/${conversationId}/analysis-status`
  );
}

main()
  .then(() => {
    console.log("\n✨ Done!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
