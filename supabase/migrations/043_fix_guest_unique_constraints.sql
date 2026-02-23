-- Migration: Fix unique constraints for guest access
--
-- The original unique constraints on response_likes and response_feedback
-- collide with guest rows that all share SYSTEM_USER_ID as user_id.
-- This migration makes the original constraints PARTIAL so they only
-- apply to authenticated member rows (guest_session_id IS NULL).
-- The guest-specific partial unique indexes from migration 042 remain unchanged.
--
-- NOTE: This migration is idempotent — safe to run multiple times.

-- ============================================================
-- Fix: response_likes — make "unique_like" partial
-- ============================================================
-- Only drop the original constraint if it exists and is NOT already partial.
-- We re-create it with a WHERE clause so it only applies to member rows.
DO $$
BEGIN
  -- Drop the old non-partial unique constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_like'
    AND conrelid = 'public.response_likes'::regclass
  ) THEN
    ALTER TABLE "public"."response_likes" DROP CONSTRAINT "unique_like";
  END IF;
END $$;

-- Re-create as a partial unique index (member rows only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_response_likes_member_unique
  ON "public"."response_likes" ("response_id", "user_id")
  WHERE "guest_session_id" IS NULL;

-- ============================================================
-- Fix: response_feedback — make original unique constraint partial
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'response_feedback_conversation_id_response_id_user_id_key'
    AND conrelid = 'public.response_feedback'::regclass
  ) THEN
    ALTER TABLE "public"."response_feedback"
      DROP CONSTRAINT "response_feedback_conversation_id_response_id_user_id_key";
  END IF;
END $$;

-- Re-create as a partial unique index (member rows only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_response_feedback_member_unique
  ON "public"."response_feedback" ("conversation_id", "response_id", "user_id")
  WHERE "guest_session_id" IS NULL;
