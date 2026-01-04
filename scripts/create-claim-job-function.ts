#!/usr/bin/env tsx
/**
 * Create claim_analysis_job database function
 *
 * This script creates a PostgreSQL function to bypass PostgREST schema cache issues
 * when claiming analysis jobs.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error("❌ Missing required environment variables:");
    console.error("  - NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
    console.error("  - SUPABASE_SECRET_KEY");
    process.exit(1);
  }

  console.log("🔧 Creating claim_analysis_job database function...");
  console.log(`   Host: ${new URL(supabaseUrl).host}\n`);

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const sql = `
-- ============================================================================
-- Function 1: claim_analysis_job
-- ============================================================================
DROP FUNCTION IF EXISTS public.claim_analysis_job(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.claim_analysis_job(
  p_job_id UUID,
  p_locked_at TIMESTAMPTZ,
  p_cutoff TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  claimed BOOLEAN
) AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Attempt to claim the job with the same logic as the TypeScript version
  UPDATE public.conversation_analysis_jobs
  SET
    status = 'running',
    locked_at = p_locked_at,
    updated_at = p_locked_at
  WHERE
    conversation_analysis_jobs.id = p_job_id
    AND (
      -- Normal claim: queued and not locked
      (status = 'queued' AND locked_at IS NULL)
      -- Reclaim: queued but stale lock
      OR (status = 'queued' AND locked_at < p_cutoff)
      -- Reclaim: running but no lock
      OR (status = 'running' AND locked_at IS NULL)
      -- Reclaim: running but stale lock (crashed executor)
      OR (status = 'running' AND locked_at < p_cutoff)
    );

  -- Get the number of rows updated
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Return result
  IF v_updated_count > 0 THEN
    RETURN QUERY SELECT p_job_id, TRUE;
  ELSE
    RETURN QUERY SELECT p_job_id, FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.claim_analysis_job(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_analysis_job(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ============================================================================
-- Function 2: fetch_next_analysis_job
-- ============================================================================
DROP FUNCTION IF EXISTS public.fetch_next_analysis_job(TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.fetch_next_analysis_job(
  p_cutoff TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  status TEXT,
  attempts INTEGER,
  strategy TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID,
  last_error TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.conversation_id,
    j.status,
    j.attempts,
    j.strategy,
    j.locked_at,
    j.created_at,
    j.updated_at,
    j.created_by,
    j.last_error
  FROM public.conversation_analysis_jobs j
  WHERE
    j.status = 'queued'
    OR (j.status = 'running' AND j.locked_at IS NULL)
    OR (j.status = 'running' AND j.locked_at < p_cutoff)
  ORDER BY j.created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fetch_next_analysis_job(TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_next_analysis_job(TIMESTAMPTZ) TO service_role;
`;

  // Execute the SQL using a Postgres connection
  // Since Supabase client doesn't support arbitrary SQL, we'll use the Edge Function approach
  // or create a temporary RPC function

  console.log("📝 SQL to execute:");
  console.log(sql);
  console.log("\n⚠️  Please execute the above SQL in your Supabase SQL Editor:");
  console.log(`   ${supabaseUrl.replace('//', '//app.')}/project/_/sql`);
  console.log("\n   Or copy/paste this SQL directly into the SQL editor.\n");

  // Alternative: Try to use a generic SQL executor if available
  console.log("🔍 Attempting to execute via RPC (if available)...");

  const { data, error } = await supabase.rpc("exec_sql", { sql });

  if (error) {
    console.warn("⚠️  RPC execution not available. Please run the SQL manually.");
    console.log("\n💡 Steps:");
    console.log("   1. Go to your Supabase SQL Editor");
    console.log("   2. Copy the SQL shown above");
    console.log("   3. Paste and execute it");
    console.log("   4. Re-run your analysis worker");
  } else {
    console.log("✅ Function created successfully!");
  }
}

main().catch((err) => {
  console.error("💥 Error:", err);
  process.exit(1);
});
