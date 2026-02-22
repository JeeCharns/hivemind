/**
 * Seed script: Creates the Welcome Hive and its conversations.
 *
 * Run with: npx tsx scripts/seed-welcome-hive.ts
 *
 * Idempotent: Safe to run multiple times.
 */

import { createClient } from "@supabase/supabase-js";
import {
  WELCOME_HIVE_ID,
  WELCOME_HIVE_SLUG,
  WELCOME_DISCUSS_ID,
  WELCOME_DECIDE_ID,
} from "../lib/hives/constants";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedWelcomeHive() {
  console.log("[seed] Creating Welcome Hive...");

  // 1. Upsert the Welcome Hive
  const { error: hiveError } = await supabase.from("hives").upsert(
    {
      id: WELCOME_HIVE_ID,
      slug: WELCOME_HIVE_SLUG,
      name: "Welcome to Hive",
      visibility: "public", // Searchable and joinable by anyone
      is_system_hive: true,
    },
    { onConflict: "id" }
  );

  if (hiveError) {
    console.error("[seed] Failed to create Welcome Hive:", hiveError);
    process.exit(1);
  }
  console.log("[seed] Welcome Hive created/updated");

  // 2. Upsert the Discuss conversation
  const { error: discussError } = await supabase.from("conversations").upsert(
    {
      id: WELCOME_DISCUSS_ID,
      hive_id: WELCOME_HIVE_ID,
      slug: "what-should-hive-build-discuss",
      title: "What should Hive build next?",
      description:
        "Share your ideas for new features. What would make Hivemind more useful for your community?",
      type: "understand",
      phase: "listen_open",
      analysis_status: "not_started",
    },
    { onConflict: "id" }
  );

  if (discussError) {
    console.error(
      "[seed] Failed to create Discuss conversation:",
      discussError
    );
    process.exit(1);
  }
  console.log("[seed] Discuss conversation created/updated");

  // 3. Upsert the Decide conversation (linked to Discuss)
  const { error: decideError } = await supabase.from("conversations").upsert(
    {
      id: WELCOME_DECIDE_ID,
      hive_id: WELCOME_HIVE_ID,
      slug: "what-should-hive-build-decide",
      title: "What should Hive build next?",
      description:
        "Vote on the top ideas from our discussion. Use your credits wisely!",
      type: "decide",
      phase: "listen_open", // Will transition to vote_open later
      analysis_status: "not_started",
      source_conversation_id: WELCOME_DISCUSS_ID,
    },
    { onConflict: "id" }
  );

  if (decideError) {
    console.error("[seed] Failed to create Decide conversation:", decideError);
    process.exit(1);
  }
  console.log("[seed] Decide conversation created/updated");

  console.log("[seed] Welcome Hive seeding complete!");
}

seedWelcomeHive().catch((err) => {
  console.error("[seed] Unexpected error:", err);
  process.exit(1);
});
