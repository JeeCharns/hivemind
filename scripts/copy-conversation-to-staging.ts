/**
 * Copy conversation data from production to staging
 *
 * Usage:
 *   npx tsx scripts/copy-conversation-to-staging.ts
 *
 * Required environment variables:
 *   PROD_SUPABASE_URL - Production Supabase URL
 *   PROD_SUPABASE_SERVICE_KEY - Production service role key
 *   STAGING_SUPABASE_URL - Staging Supabase URL
 *   STAGING_SUPABASE_SERVICE_KEY - Staging service role key
 *
 * You can set these in a .env.copy file and run with:
 *   env $(cat .env.copy | xargs) npx tsx scripts/copy-conversation-to-staging.ts
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Configuration - update these values
const CONVERSATION_ID = "a90f0609-4919-4393-acac-4ad7dd0c1279";
const HIVE_ID = "32e20e72-5379-44a2-9982-413e1c1618e1";

// Set to true if you also want to copy the hive record
const COPY_HIVE = true;

// Set to a different hive ID if you want to assign the conversation to a different hive in staging
const TARGET_HIVE_ID: string | null = null; // null means use the same hive_id

// Default system user ID used for anonymous/imported responses
// This is the hardcoded default in the schema
const DEFAULT_SYSTEM_USER_ID = "c8661a31-3493-4c0f-9f14-0c08fcc68696";

interface CopyResult {
  table: string;
  copied: number;
  errors: string[];
}

async function main() {
  // Validate environment variables
  const prodUrl = process.env.PROD_SUPABASE_URL;
  const prodKey = process.env.PROD_SUPABASE_SERVICE_KEY;
  const stagingUrl = process.env.STAGING_SUPABASE_URL;
  const stagingKey = process.env.STAGING_SUPABASE_SERVICE_KEY;

  if (!prodUrl || !prodKey || !stagingUrl || !stagingKey) {
    console.error("Missing required environment variables:");
    console.error("  PROD_SUPABASE_URL:", prodUrl ? "✓" : "✗");
    console.error("  PROD_SUPABASE_SERVICE_KEY:", prodKey ? "✓" : "✗");
    console.error("  STAGING_SUPABASE_URL:", stagingUrl ? "✓" : "✗");
    console.error("  STAGING_SUPABASE_SERVICE_KEY:", stagingKey ? "✓" : "✗");
    process.exit(1);
  }

  const prodClient = createClient(prodUrl, prodKey);
  const stagingClient = createClient(stagingUrl, stagingKey);

  console.log("=".repeat(60));
  console.log("Copying conversation data from Production to Staging");
  console.log("=".repeat(60));
  console.log(`Conversation ID: ${CONVERSATION_ID}`);
  console.log(`Hive ID: ${HIVE_ID}`);
  console.log(`Target Hive ID: ${TARGET_HIVE_ID || HIVE_ID}`);
  console.log("=".repeat(60));

  const results: CopyResult[] = [];

  try {
    // 0. Ensure system profile exists in staging (needed for response user_id FK)
    console.log("\n[0/13] Ensuring system profile exists in staging...");
    const profileResult = await ensureSystemProfile(stagingClient);
    results.push(profileResult);

    if (profileResult.errors.length > 0) {
      console.error("Failed to create system profile - aborting");
      process.exit(1);
    }

    // 1. Copy hive if needed
    if (COPY_HIVE) {
      console.log("\n[1/13] Copying hive...");
      const hiveResult = await copyHive(prodClient, stagingClient);
      results.push(hiveResult);
    }

    // 2. Copy conversation
    console.log("\n[2/13] Copying conversation...");
    const convResult = await copyConversation(prodClient, stagingClient);
    results.push(convResult);

    // 3. Copy responses
    console.log("\n[3/13] Copying responses...");
    const responsesResult = await copyResponses(prodClient, stagingClient);
    results.push(responsesResult);

    // 4. Copy themes
    console.log("\n[4/13] Copying themes...");
    const themesResult = await copyThemes(prodClient, stagingClient);
    results.push(themesResult);

    // 5. Copy response embeddings
    console.log("\n[5/13] Copying response embeddings...");
    const embeddingsResult = await copyEmbeddings(prodClient, stagingClient);
    results.push(embeddingsResult);

    // 6. Copy attachments
    console.log("\n[6/13] Copying attachments...");
    const attachmentsResult = await copyAttachments(prodClient, stagingClient);
    results.push(attachmentsResult);

    // 7. Copy analysis jobs
    console.log("\n[7/13] Copying analysis jobs...");
    const jobsResult = await copyAnalysisJobs(prodClient, stagingClient);
    results.push(jobsResult);

    // 8. Copy cluster models
    console.log("\n[8/13] Copying cluster models...");
    const modelsResult = await copyClusterModels(prodClient, stagingClient);
    results.push(modelsResult);

    // 9. Copy reports
    console.log("\n[9/13] Copying reports...");
    const reportsResult = await copyReports(prodClient, stagingClient);
    results.push(reportsResult);

    // 10. Copy response feedback
    console.log("\n[10/13] Copying response feedback...");
    const feedbackResult = await copyResponseFeedback(
      prodClient,
      stagingClient
    );
    results.push(feedbackResult);

    // 11. Copy response likes
    console.log("\n[11/13] Copying response likes...");
    const likesResult = await copyResponseLikes(prodClient, stagingClient);
    results.push(likesResult);

    // 12. Copy quadratic vote allocations
    console.log("\n[12/13] Copying quadratic vote allocations...");
    const votesResult = await copyQuadraticVotes(prodClient, stagingClient);
    results.push(votesResult);

    // 13. Copy quadratic vote budgets
    console.log("\n[13/13] Copying quadratic vote budgets...");
    const budgetsResult = await copyQuadraticBudgets(prodClient, stagingClient);
    results.push(budgetsResult);

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));
    for (const result of results) {
      const status = result.errors.length === 0 ? "✓" : "⚠";
      console.log(`${status} ${result.table}: ${result.copied} records`);
      for (const error of result.errors) {
        console.log(`    Error: ${error}`);
      }
    }
    console.log("=".repeat(60));
    console.log("Done!");
  } catch (error) {
    console.error("\nFatal error:", error);
    process.exit(1);
  }
}

async function ensureSystemProfile(
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "profiles (system user)",
    copied: 0,
    errors: [],
  };

  // Check if the system profile already exists
  const { data: existing } = await staging
    .from("profiles")
    .select("id")
    .eq("id", DEFAULT_SYSTEM_USER_ID)
    .single();

  if (existing) {
    console.log("  System profile already exists");
    result.copied = 1;
    return result;
  }

  // The profiles table has FK to auth.users, so we need to use raw SQL
  // to insert with a specific ID, or we create a placeholder user first
  // For now, let's try a direct insert - if it fails due to FK, we'll handle it
  const { error: insertError } = await staging.from("profiles").insert({
    id: DEFAULT_SYSTEM_USER_ID,
    display_name: "System (Imported)",
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    // If FK violation, we need to create the auth.users entry first
    // This requires using the auth admin API or raw SQL
    if (insertError.message.includes("foreign key")) {
      result.errors.push(
        `Cannot create system profile - auth.users entry needed. ` +
          `Run this SQL in staging Supabase SQL Editor first:\n` +
          `  INSERT INTO auth.users (id, email, created_at, updated_at) ` +
          `  VALUES ('${DEFAULT_SYSTEM_USER_ID}', 'system@hivemind.local', now(), now()) ` +
          `  ON CONFLICT (id) DO NOTHING;\n` +
          `  INSERT INTO public.profiles (id, display_name) ` +
          `  VALUES ('${DEFAULT_SYSTEM_USER_ID}', 'System (Imported)') ` +
          `  ON CONFLICT (id) DO NOTHING;`
      );
    } else {
      result.errors.push(`Failed to create system profile: ${insertError.message}`);
    }
    return result;
  }

  result.copied = 1;
  console.log("  Created system profile");
  return result;
}

async function copyHive(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = { table: "hives", copied: 0, errors: [] };

  const { data, error } = await prod
    .from("hives")
    .select("*")
    .eq("id", HIVE_ID)
    .single();

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data) {
    result.errors.push("Hive not found in production");
    return result;
  }

  const { error: insertError } = await staging
    .from("hives")
    .upsert(data, { onConflict: "id" });

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = 1;
  console.log(`  Copied hive: ${data.name}`);
  return result;
}

async function copyConversation(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = { table: "conversations", copied: 0, errors: [] };

  const { data, error } = await prod
    .from("conversations")
    .select("*")
    .eq("id", CONVERSATION_ID)
    .single();

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data) {
    result.errors.push("Conversation not found in production");
    return result;
  }

  // Optionally remap to different hive
  if (TARGET_HIVE_ID) {
    data.hive_id = TARGET_HIVE_ID;
  }

  // IMPORTANT: Null out created_by since it references auth.users which won't exist in staging
  // The auth.users table is internal to Supabase and user IDs differ between environments
  data.created_by = null;

  // Also null out source_conversation_id if it references a conversation that doesn't exist
  data.source_conversation_id = null;

  const { error: insertError } = await staging
    .from("conversations")
    .upsert(data, { onConflict: "id" });

  // If upsert doesn't report error but also doesn't insert, try insert directly for better error
  if (!insertError) {
    const { data: checkData } = await staging
      .from("conversations")
      .select("id")
      .eq("id", CONVERSATION_ID)
      .single();

    if (!checkData) {
      result.errors.push(
        "Insert appeared to succeed but conversation not found - likely FK constraint violation"
      );
      return result;
    }
  }

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = 1;
  console.log(`  Copied conversation: ${data.title}`);
  return result;
}

async function copyResponses(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "conversation_responses",
    copied: 0,
    errors: [],
  };

  const { data, error } = await prod
    .from("conversation_responses")
    .select("*")
    .eq("conversation_id", CONVERSATION_ID)
    .order("id");

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No responses to copy");
    return result;
  }

  // Remap all user_ids to the system user since the original users won't exist in staging
  // The profiles table has FK to auth.users, so we can't just copy user IDs
  const remappedData = data.map((response) => ({
    ...response,
    user_id: DEFAULT_SYSTEM_USER_ID,
  }));

  // Insert in batches to avoid timeout
  const BATCH_SIZE = 100;
  for (let i = 0; i < remappedData.length; i += BATCH_SIZE) {
    const batch = remappedData.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await staging
      .from("conversation_responses")
      .upsert(batch, { onConflict: "id" });

    if (insertError) {
      result.errors.push(
        `Failed to insert batch ${i / BATCH_SIZE + 1}: ${insertError.message}`
      );
    } else {
      result.copied += batch.length;
    }
  }

  console.log(`  Copied ${result.copied} responses`);
  return result;
}

async function copyThemes(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "conversation_themes",
    copied: 0,
    errors: [],
  };

  const { data, error } = await prod
    .from("conversation_themes")
    .select("*")
    .eq("conversation_id", CONVERSATION_ID);

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No themes to copy");
    return result;
  }

  const { error: insertError } = await staging
    .from("conversation_themes")
    .upsert(data, { onConflict: "id" });

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = data.length;
  console.log(`  Copied ${result.copied} themes`);
  return result;
}

async function copyEmbeddings(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "conversation_response_embeddings",
    copied: 0,
    errors: [],
  };

  const { data, error } = await prod
    .from("conversation_response_embeddings")
    .select("*")
    .eq("conversation_id", CONVERSATION_ID);

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No embeddings to copy");
    return result;
  }

  // Insert in batches
  const BATCH_SIZE = 50;
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await staging
      .from("conversation_response_embeddings")
      .upsert(batch, { onConflict: "response_id" });

    if (insertError) {
      result.errors.push(
        `Failed to insert batch ${i / BATCH_SIZE + 1}: ${insertError.message}`
      );
    } else {
      result.copied += batch.length;
    }
  }

  console.log(`  Copied ${result.copied} embeddings`);
  return result;
}

async function copyAttachments(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "conversation_attachments",
    copied: 0,
    errors: [],
  };

  const { data, error } = await prod
    .from("conversation_attachments")
    .select("*")
    .eq("conversation_id", CONVERSATION_ID);

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No attachments to copy");
    return result;
  }

  const { error: insertError } = await staging
    .from("conversation_attachments")
    .upsert(data, { onConflict: "id" });

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = data.length;
  console.log(`  Copied ${result.copied} attachments`);
  return result;
}

async function copyAnalysisJobs(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "conversation_analysis_jobs",
    copied: 0,
    errors: [],
  };

  const { data, error } = await prod
    .from("conversation_analysis_jobs")
    .select("*")
    .eq("conversation_id", CONVERSATION_ID);

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No analysis jobs to copy");
    return result;
  }

  const { error: insertError } = await staging
    .from("conversation_analysis_jobs")
    .upsert(data, { onConflict: "id" });

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = data.length;
  console.log(`  Copied ${result.copied} analysis jobs`);
  return result;
}

async function copyClusterModels(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "conversation_cluster_models",
    copied: 0,
    errors: [],
  };

  const { data, error } = await prod
    .from("conversation_cluster_models")
    .select("*")
    .eq("conversation_id", CONVERSATION_ID);

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No cluster models to copy");
    return result;
  }

  const { error: insertError } = await staging
    .from("conversation_cluster_models")
    .upsert(data, { onConflict: "conversation_id,cluster_index" });

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = data.length;
  console.log(`  Copied ${result.copied} cluster models`);
  return result;
}

async function copyReports(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "conversation_reports",
    copied: 0,
    errors: [],
  };

  const { data, error } = await prod
    .from("conversation_reports")
    .select("*")
    .eq("conversation_id", CONVERSATION_ID);

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No reports to copy");
    return result;
  }

  const { error: insertError } = await staging
    .from("conversation_reports")
    .upsert(data, { onConflict: "id" });

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = data.length;
  console.log(`  Copied ${result.copied} reports`);
  return result;
}

async function copyResponseFeedback(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "response_feedback",
    copied: 0,
    errors: [],
  };

  const { data, error } = await prod
    .from("response_feedback")
    .select("*")
    .eq("conversation_id", CONVERSATION_ID);

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No response feedback to copy");
    return result;
  }

  const { error: insertError } = await staging
    .from("response_feedback")
    .upsert(data, { onConflict: "id" });

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = data.length;
  console.log(`  Copied ${result.copied} feedback records`);
  return result;
}

async function copyResponseLikes(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "response_likes",
    copied: 0,
    errors: [],
  };

  // Get response IDs for this conversation first
  const { data: responses, error: responsesError } = await prod
    .from("conversation_responses")
    .select("id")
    .eq("conversation_id", CONVERSATION_ID);

  if (responsesError || !responses || responses.length === 0) {
    console.log("  No response likes to copy (no responses found)");
    return result;
  }

  const responseIds = responses.map((r) => r.id);

  const { data, error } = await prod
    .from("response_likes")
    .select("*")
    .in("response_id", responseIds);

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No response likes to copy");
    return result;
  }

  const { error: insertError } = await staging
    .from("response_likes")
    .upsert(data, { onConflict: "id" });

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = data.length;
  console.log(`  Copied ${result.copied} likes`);
  return result;
}

async function copyQuadraticVotes(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "quadratic_vote_allocations",
    copied: 0,
    errors: [],
  };

  const { data, error } = await prod
    .from("quadratic_vote_allocations")
    .select("*")
    .eq("conversation_id", CONVERSATION_ID);

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No quadratic votes to copy");
    return result;
  }

  const { error: insertError } = await staging
    .from("quadratic_vote_allocations")
    .upsert(data, { onConflict: "id" });

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = data.length;
  console.log(`  Copied ${result.copied} vote allocations`);
  return result;
}

async function copyQuadraticBudgets(
  prod: SupabaseClient,
  staging: SupabaseClient
): Promise<CopyResult> {
  const result: CopyResult = {
    table: "quadratic_vote_budgets",
    copied: 0,
    errors: [],
  };

  const { data, error } = await prod
    .from("quadratic_vote_budgets")
    .select("*")
    .eq("conversation_id", CONVERSATION_ID);

  if (error) {
    result.errors.push(`Failed to fetch from production: ${error.message}`);
    return result;
  }

  if (!data || data.length === 0) {
    console.log("  No quadratic budgets to copy");
    return result;
  }

  const { error: insertError } = await staging
    .from("quadratic_vote_budgets")
    .upsert(data, { onConflict: "id" });

  if (insertError) {
    result.errors.push(`Failed to insert into staging: ${insertError.message}`);
    return result;
  }

  result.copied = data.length;
  console.log(`  Copied ${result.copied} vote budgets`);
  return result;
}

main();
