#!/usr/bin/env tsx
/**
 * Diagnose PostgREST Table Visibility
 *
 * This script checks what PostgREST can see about the conversation_analysis_jobs table
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

  console.log("🔍 Diagnosing PostgREST table visibility...");
  console.log(`   Host: ${new URL(supabaseUrl).host}\n`);

  const admin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Test 1: Can we select from the table at all?
  console.log("1️⃣  Testing basic table access...");
  const { data: selectTest, error: selectError } = await admin
    .from("conversation_analysis_jobs")
    .select("*")
    .limit(1);

  if (selectError) {
    console.error("   ❌ Cannot select from table:");
    console.error(`      ${selectError.message}`);
    console.error(`      Code: ${selectError.code}`);
  } else {
    console.log("   ✅ Can select from table");
    console.log(`      Sample columns: ${Object.keys(selectTest?.[0] || {}).join(", ") || "no rows"}`);
  }

  // Test 2: Can we select specific columns?
  console.log("\n2️⃣  Testing specific column access...");
  const columns = ["id", "status", "locked_at", "updated_at", "created_at"];

  for (const col of columns) {
    const { error } = await admin
      .from("conversation_analysis_jobs")
      .select(col)
      .limit(1);

    if (error) {
      console.log(`   ❌ ${col}: ${error.message}`);
    } else {
      console.log(`   ✅ ${col}`);
    }
  }

  // Test 3: Can we insert?
  console.log("\n3️⃣  Testing insert capability...");
  const testConvId = "00000000-0000-0000-0000-000000000000";
  const testUserId = "00000000-0000-0000-0000-000000000000";

  const { data: insertTest, error: insertError } = await admin
    .from("conversation_analysis_jobs")
    .insert({
      conversation_id: testConvId,
      created_by: testUserId,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23503") {
      console.log("   ⚠️  Cannot insert (foreign key constraint - expected)");
    } else {
      console.log(`   ❌ Cannot insert: ${insertError.message}`);
      console.log(`      Code: ${insertError.code}`);
    }
  } else {
    console.log("   ✅ Can insert");
    // Clean up
    await admin.from("conversation_analysis_jobs").delete().eq("id", insertTest.id);
  }

  // Test 4: Can we update?
  console.log("\n4️⃣  Testing update capability...");
  const { error: updateError } = await admin
    .from("conversation_analysis_jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", "00000000-0000-0000-0000-000000000000")
    .select("id");

  if (updateError) {
    console.log(`   ❌ Cannot update: ${updateError.message}`);
    console.log(`      Code: ${updateError.code}`);
  } else {
    console.log("   ✅ Can update (no rows matched, but query worked)");
  }

  // Test 5: Check table schema in information_schema
  console.log("\n5️⃣  Checking what columns exist in the database...");
  console.log("   Run this SQL in Supabase SQL editor:");
  console.log(`
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'conversation_analysis_jobs'
   ORDER BY ordinal_position;
  `);

  console.log("\n✨ Diagnosis complete!");
  console.log("\n💡 If columns show as not existing but you know they're in the database:");
  console.log("   1. Restart your Supabase project");
  console.log("   2. Or wait 5-10 minutes for PostgREST to auto-reload");
  console.log("   3. Or contact Supabase support if issue persists");
}

main().catch((err) => {
  console.error("💥 Error:", err);
  process.exit(1);
});
