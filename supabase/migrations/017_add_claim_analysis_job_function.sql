-- Migration: Add claim_analysis_job function
-- Date: 2026-01-04
-- Description: Add a PostgreSQL function to claim analysis jobs, bypassing PostgREST schema cache issues

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.claim_analysis_job(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

-- Create function to claim an analysis job
-- This bypasses PostgREST's schema cache by using direct SQL
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

COMMENT ON FUNCTION public.claim_analysis_job IS 'Atomically claims an analysis job for processing, bypassing PostgREST schema cache issues';

-- Create function to fetch next available job
-- This bypasses PostgREST's schema cache for the worker's job polling
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

COMMENT ON FUNCTION public.fetch_next_analysis_job IS 'Fetches the next available analysis job, bypassing PostgREST schema cache issues';
