#!/usr/bin/env node
/**
 * Fix Stuck Analysis Jobs
 *
 * When PostgREST schema cache is stale, jobs can get stuck even though
 * the analysis completed. This script marks them as succeeded.
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error("❌ Missing required environment variables");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("🔍 Checking for stuck jobs...");

  // Find jobs that are in running/queued state but whose conversations have completed analysis
  const { data: conversations, error: convError } = await supabase
    .from("conversations")
    .select("id, analysis_status")
    .eq("analysis_status", "completed");

  if (convError) {
    console.error("❌ Error fetching conversations:", convError);
    process.exit(1);
  }

  if (!conversations || conversations.length === 0) {
    console.log("ℹ️  No completed conversations found");
    return;
  }

  const conversationIds = conversations.map((c) => c.id);

  const { data: stuckJobs, error: jobError } = await supabase
    .from("conversation_analysis_jobs")
    .select("id, conversation_id, status, attempts")
    .in("conversation_id", conversationIds)
    .in("status", ["queued", "running"]);

  if (jobError) {
    console.error("❌ Error fetching jobs:", jobError);
    console.log("\n💡 This is likely the PostgREST schema cache issue.");
    console.log(
      "The jobs exist in the database but PostgREST can't see the columns."
    );
    console.log(
      "\nWorkaround: Wait for automatic schema cache refresh (a few minutes)"
    );
    console.log("or restart your Supabase project.");
    process.exit(1);
  }

  if (!stuckJobs || stuckJobs.length === 0) {
    console.log("✅ No stuck jobs found!");
    return;
  }

  console.log(`\n🔧 Found ${stuckJobs.length} stuck job(s):`);
  stuckJobs.forEach((job) => {
    console.log(
      `   - Job ${job.id.substring(0, 8)}... for conversation ${job.conversation_id.substring(0, 8)}... (status: ${job.status}, attempts: ${job.attempts})`
    );
  });

  console.log("\n🔄 Marking jobs as succeeded...");

  for (const job of stuckJobs) {
    const { error } = await supabase
      .from("conversation_analysis_jobs")
      .update({
        status: "succeeded",
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) {
      console.error(`   ❌ Failed to update job ${job.id}:`, error.message);
    } else {
      console.log(`   ✅ Updated job ${job.id.substring(0, 8)}...`);
    }
  }

  console.log("\n✨ Done!");
}

main().catch((err) => {
  console.error("💥 Unexpected error:", err);
  process.exit(1);
});
