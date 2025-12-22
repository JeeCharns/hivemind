#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } }
);

(async () => {
  console.log("Fetching failed jobs with PostgREST errors...\n");

  const { data: jobs, error } = await supabase
    .from("conversation_analysis_jobs")
    .select("*")
    .eq("status", "failed")
    .ilike("last_error", "%PostgREST%");

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Found ${jobs?.length || 0} failed job(s):\n`);

  for (const job of jobs || []) {
    console.log(`Job ID: ${job.id}`);
    console.log(`Conversation ID: ${job.conversation_id}`);
    console.log(`Status: ${job.status}`);
    console.log(`Attempts: ${job.attempts}`);
    console.log(`Strategy: ${job.strategy}`);
    console.log(`Last error: ${job.last_error?.substring(0, 100)}...`);
    console.log();

    // Check if conversation exists
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, title, analysis_status")
      .eq("id", job.conversation_id)
      .maybeSingle();

    if (convError) {
      console.log(`  ❌ Error checking conversation: ${convError.message}`);
    } else if (!conv) {
      console.log(`  ⚠️  Conversation does not exist!`);
    } else {
      console.log(`  ✅ Conversation found: "${conv.title}"`);
      console.log(`     Analysis status: ${conv.analysis_status}`);
    }
    console.log();
  }
})();
