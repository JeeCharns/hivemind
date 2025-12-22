#!/usr/bin/env tsx
/**
 * Reload PostgREST Schema Cache
 *
 * This script sends a NOTIFY to PostgREST to reload its schema cache.
 * Use this when you've made database schema changes and PostgREST is still
 * using an old cached version.
 *
 * Usage:
 *   tsx scripts/reload-postgrest-schema.ts
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error("❌ Missing required environment variables:");
    console.error("  - NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
    console.error("  - SUPABASE_SECRET_KEY");
    process.exit(1);
  }

  console.log("🔄 Connecting to Supabase...");
  console.log(`   Host: ${new URL(supabaseUrl).host}`);

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  console.log("\n🔔 Sending schema reload notification to PostgREST...");

  // Use direct SQL query since pg_notify isn't exposed via RPC
  const { error } = await supabase.rpc("exec_sql", {
    sql: "SELECT pg_notify('pgrst', 'reload schema')",
  });

  if (error) {
    // If exec_sql doesn't exist, try the direct query approach
    const { error: directError } = await supabase
      .from("_supabase_schema_cache_reload")
      .select("*")
      .limit(1);

    if (directError) {
      console.error("❌ Failed to reload schema cache via API:");
      console.error(error);

      console.log("\n💡 Please use one of these alternative methods:");
      console.log("\n1. Run this SQL in Supabase SQL editor:");
      console.log("   SELECT pg_notify('pgrst', 'reload schema');");
      console.log("\n2. Or restart your Supabase project from the dashboard.");
      console.log("\n3. The schema cache also reloads automatically every few minutes.");
      process.exit(1);
    }
  }

  console.log("✅ Schema cache reload request sent!");
  console.log("\n🔍 Verifying conversation_analysis_jobs table schema...");

  // Try to query the table to see if status column is now visible
  const { data: testData, error: testError } = await supabase
    .from("conversation_analysis_jobs")
    .select("id, status, locked_at, created_at")
    .limit(1);

  if (testError) {
    console.warn("⚠️  Still seeing issues querying the table:");
    console.warn(`   Error: ${testError.message}`);
    console.warn(`   Code: ${testError.code}`);
    console.log("\n💡 The schema cache might take a few seconds to reload.");
    console.log("   Try your CSV import again in 5-10 seconds.");
  } else {
    console.log("✅ Table query successful! Status column is now visible.");
    console.log(`   Sample: ${JSON.stringify(testData?.[0] || "no rows")}`);
  }

  console.log("\n✨ Done! You can now try importing a CSV again.");
}

main().catch((err) => {
  console.error("💥 Unexpected error:", err);
  process.exit(1);
});
