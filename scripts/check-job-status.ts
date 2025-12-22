#!/usr/bin/env node
/**
 * Check Job Status
 *
 * Diagnostic script to see what's happening with analysis jobs
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

  console.log("🔍 Checking recent conversations...\n");

  // Get recent conversations
  const { data: conversations, error: convError } = await supabase
    .from("conversations")
    .select("id, title, analysis_status, response_count, analyzed_count")
    .order("created_at", { ascending: false })
    .limit(5);

  if (convError) {
    console.error("❌ Error fetching conversations:", convError);
    process.exit(1);
  }

  console.log("Recent conversations:");
  conversations?.forEach((conv) => {
    console.log(`  ${conv.id.substring(0, 8)}... "${conv.title}"`);
    console.log(`    Status: ${conv.analysis_status || "null"}`);
    console.log(
      `    Responses: ${conv.response_count || 0}, Analyzed: ${conv.analyzed_count || 0}`
    );
  });

  console.log("\n🔍 Checking jobs...\n");

  // Get recent jobs
  const { data: jobs, error: jobError } = await supabase
    .from("conversation_analysis_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (jobError) {
    console.error("❌ Error fetching jobs:", jobError);
    console.log("\n💡 This is the PostgREST schema cache issue!");
    console.log(
      "   The table exists but PostgREST doesn't know about its columns."
    );
    process.exit(1);
  }

  console.log("Recent jobs:");
  jobs?.forEach((job) => {
    console.log(`  Job ${job.id.substring(0, 8)}...`);
    console.log(`    Conversation: ${job.conversation_id.substring(0, 8)}...`);
    console.log(`    Status: ${job.status}`);
    console.log(`    Strategy: ${job.strategy}`);
    console.log(`    Attempts: ${job.attempts}`);
    console.log(`    Locked at: ${job.locked_at || "null"}`);
    console.log(`    Last error: ${job.last_error || "null"}`);
  });
}

main().catch((err) => {
  console.error("💥 Unexpected error:", err);
  process.exit(1);
});
