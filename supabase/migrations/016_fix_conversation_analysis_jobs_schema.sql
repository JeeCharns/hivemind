-- Migration: Fix conversation_analysis_jobs schema (status + locking)
-- Date: 2025-12-21
-- Description: Some environments have a legacy jobs table missing the `status` column.
--              This migration creates/normalizes the schema so background analysis can claim jobs safely.

-- 1. Ensure the table exists (minimal schema expected by the app)
CREATE TABLE IF NOT EXISTS public.conversation_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by UUID NULL,
  status TEXT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  strategy TEXT NOT NULL DEFAULT 'full',
  last_error TEXT NULL,
  locked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Normalize legacy column names -> status (if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversation_analysis_jobs'
      AND column_name = 'job_status'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversation_analysis_jobs'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.conversation_analysis_jobs RENAME COLUMN job_status TO status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversation_analysis_jobs'
      AND column_name = 'state'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversation_analysis_jobs'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.conversation_analysis_jobs RENAME COLUMN state TO status;
  END IF;
END $$;

-- 3. Ensure expected columns exist
ALTER TABLE public.conversation_analysis_jobs
  ADD COLUMN IF NOT EXISTS status TEXT NULL,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategy TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS last_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 4. Backfill + constrain status values
UPDATE public.conversation_analysis_jobs
SET status = 'queued'
WHERE status IS NULL;

ALTER TABLE public.conversation_analysis_jobs
  ALTER COLUMN status SET DEFAULT 'queued';

ALTER TABLE public.conversation_analysis_jobs
  ALTER COLUMN status SET NOT NULL;

-- Drop any existing status constraint (name may vary) and replace with a known-good one
DO $$
DECLARE c record;
BEGIN
  FOR c IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.conversation_analysis_jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.conversation_analysis_jobs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.conversation_analysis_jobs
  ADD CONSTRAINT conversation_analysis_jobs_status_check
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed'));

-- Strategy constraint (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.conversation_analysis_jobs'::regclass
      AND conname = 'conversation_analysis_jobs_strategy_check'
  ) THEN
    ALTER TABLE public.conversation_analysis_jobs
      ADD CONSTRAINT conversation_analysis_jobs_strategy_check
      CHECK (strategy IN ('incremental', 'full'));
  END IF;
END $$;

-- 5. Indices for queue operations + anti-duplication
CREATE INDEX IF NOT EXISTS idx_conversation_analysis_jobs_status_created_at
ON public.conversation_analysis_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_conversation_analysis_jobs_locked_at
ON public.conversation_analysis_jobs(locked_at);

-- Ensure only one queued/running job per conversation
CREATE UNIQUE INDEX IF NOT EXISTS uniq_conversation_analysis_jobs_active
ON public.conversation_analysis_jobs(conversation_id)
WHERE status IN ('queued', 'running');

-- 6. Ensure PostgREST picks up schema changes immediately (Supabase API)
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION
  WHEN others THEN
    -- Ignore if notify is not available in the current environment
    NULL;
END $$;
