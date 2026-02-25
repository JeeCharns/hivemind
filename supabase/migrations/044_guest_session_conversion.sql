-- Migration: Add guest session conversion tracking
--
-- Tracks when a guest session is converted to a full user account.
-- This enables migration of guest contributions (responses, likes, feedback)
-- to the user's permanent account when they sign up.
--
-- NOTE: This migration is idempotent — safe to run multiple times.

-- ============================================================
-- Add conversion tracking columns to guest_sessions
-- ============================================================
ALTER TABLE "public"."guest_sessions"
ADD COLUMN IF NOT EXISTS "converted_to_user_id" uuid,
ADD COLUMN IF NOT EXISTS "converted_at" timestamptz;

-- Add foreign key constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guest_sessions_converted_to_user_id_fkey'
    AND conrelid = 'public.guest_sessions'::regclass
  ) THEN
    ALTER TABLE "public"."guest_sessions"
      ADD CONSTRAINT "guest_sessions_converted_to_user_id_fkey"
      FOREIGN KEY ("converted_to_user_id")
      REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- Index for efficient lookup of unconverted sessions
-- ============================================================
-- Partial index on session_token_hash for sessions not yet converted.
-- Used during sign-up flow to find guest sessions to migrate.
CREATE INDEX IF NOT EXISTS idx_guest_sessions_unconverted
ON "public"."guest_sessions" ("session_token_hash")
WHERE "converted_to_user_id" IS NULL;

-- ============================================================
-- Column documentation
-- ============================================================
COMMENT ON COLUMN "public"."guest_sessions"."converted_to_user_id"
IS 'User ID this guest session was converted to, if any';

COMMENT ON COLUMN "public"."guest_sessions"."converted_at"
IS 'Timestamp when the session was converted to a user account';
