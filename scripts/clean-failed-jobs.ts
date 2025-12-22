#!/usr/bin/env node
/**
 * Clean Failed Jobs
 *
 * Finds jobs that failed due to PostgREST issues but whose conversations
 * actually completed successfully, and marks them as succeeded.
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

  console.log("🔍 Looking for failed jobs with PostgREST errors...\n");

  // Find failed jobs that have PostgREST error messages
  const { data: failedJobs, error: jobError } = await supabase
    .from("conversation_analysis_jobs")
    .select("id, conversation_id, status, last_error, attempts")
    .eq("status", "failed")
    .ilike("last_error", "%PostgREST%schema%");

  if (jobError) {
    console.error("❌ Error fetching jobs:", jobError);
    process.exit(1);
  }

  if (!failedJobs || failedJobs.length === 0) {
    console.log("✅ No failed jobs with PostgREST schema errors found!");
    return;
  }

  console.log(`Found ${failedJobs.length} job(s) that failed due to PostgREST schema cache issues:\n`);

  // Check each job's conversation to see if analysis actually completed
  for (const job of failedJobs) {
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, title, analysis_status")
      .eq("id", job.conversation_id)
      .maybeSingle();

    if (convError) {
      console.log(`  ❌  Job ${job.id.substring(0, 8)}... - error: ${convError.message}`);
      continue;
    }

    if (!conv) {
      console.log(`  ⚠️  Job ${job.id.substring(0, 8)}... - conversation not found`);
      continue;
    }

    console.log(`  Job ${job.id.substring(0, 8)}...`);
    console.log(`    Conversation: "${conv.title}"`);
    console.log(`    Analysis status: ${conv.analysis_status || "null"}`);

    // If the conversation has ready/completed status,
    // the analysis actually succeeded despite the job failure
    const analysisSucceeded =
      conv.analysis_status === "ready" ||
      conv.analysis_status === "completed";

    if (analysisSucceeded) {
      console.log(`    ✅ Analysis actually succeeded! Marking job as succeeded...`);

      const { error: updateError } = await supabase
        .from("conversation_analysis_jobs")
        .update({
          status: "succeeded",
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (updateError) {
        console.log(`    ❌ Failed to update: ${updateError.message}`);
      } else {
        console.log(`    ✅ Job marked as succeeded`);
      }
    } else {
      console.log(`    ⏭️  Analysis did not complete, leaving job as failed`);
    }
    console.log();
  }

  console.log("✨ Done!");
}

main().catch((err) => {
  console.error("💥 Unexpected error:", err);
  process.exit(1);
});
