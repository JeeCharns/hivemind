/**
 * Fix Conversation Status
 *
 * Directly update conversation analysis status using RPC to bypass PostgREST cache issues.
 */

import { createClient } from "@supabase/supabase-js";

const conversationId = process.argv[2];
const newStatus = process.argv[3] || "not_started";

if (!conversationId) {
  console.error(
    "Usage: npx tsx scripts/fix-conversation-status.ts <conversation-id> [status]"
  );
  console.error(
    "  status: not_started | embedding | analyzing | ready (default: not_started)"
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
  console.log(`\n🔧 Updating conversation ${conversationId}`);
  console.log(`   New status: ${newStatus}\n`);

  // Check current status
  const { data: before, error: beforeError } = await supabase
    .from("conversations")
    .select("id, analysis_status, type, slug")
    .eq("id", conversationId)
    .single();

  if (beforeError) {
    console.error("❌ Error fetching conversation:", beforeError);
    process.exit(1);
  }

  console.log(`📊 Current state:`);
  console.log(`   Slug: ${before.slug}`);
  console.log(`   Type: ${before.type}`);
  console.log(`   Analysis status: ${before.analysis_status}\n`);

  // Try using raw SQL via an RPC function
  // First, let's try a direct update
  const { data: result, error: updateError } = await supabase
    .from("conversations")
    .update({
      analysis_status: newStatus,
    })
    .eq("id", conversationId)
    .select("id, analysis_status");

  if (updateError) {
    console.error("❌ Error updating conversation:", updateError);

    console.log("\n💡 PostgREST schema cache issue detected.");
    console.log("   Please run this SQL directly in Supabase SQL editor:");
    console.log(`\n   UPDATE conversations`);
    console.log(`   SET analysis_status = '${newStatus}'`);
    console.log(`   WHERE id = '${conversationId}';`);
    console.log(`\n   Then verify with:`);
    console.log(
      `   SELECT id, analysis_status FROM conversations WHERE id = '${conversationId}';\n`
    );

    process.exit(1);
  }

  console.log(`✅ Updated conversation status!`);
  console.log(`   New status: ${result?.[0]?.analysis_status}\n`);
}

main()
  .then(() => {
    console.log("✨ Done!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
