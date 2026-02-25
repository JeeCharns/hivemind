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

-- ============================================================
-- RPC function: migrate_guest_session
-- ============================================================
-- Atomically migrates all guest contributions to a user account.
-- Updates responses, likes, feedback; auto-joins hives; marks session converted.

CREATE OR REPLACE FUNCTION migrate_guest_session(
  p_user_id UUID,
  p_guest_session_id UUID,
  p_keep_anonymous BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_responses_count INTEGER;
  v_likes_count INTEGER;
  v_feedback_count INTEGER;
  v_hive_ids UUID[];
BEGIN
  -- 1. Update responses (set user_id, clear guest_session_id, set is_anonymous)
  UPDATE conversation_responses
  SET user_id = p_user_id,
      guest_session_id = NULL,
      is_anonymous = p_keep_anonymous
  WHERE guest_session_id = p_guest_session_id;

  GET DIAGNOSTICS v_responses_count = ROW_COUNT;

  -- 2. Update likes (set user_id, clear guest_session_id)
  UPDATE response_likes
  SET user_id = p_user_id,
      guest_session_id = NULL
  WHERE guest_session_id = p_guest_session_id;

  GET DIAGNOSTICS v_likes_count = ROW_COUNT;

  -- 3. Update feedback (set user_id, clear guest_session_id)
  UPDATE response_feedback
  SET user_id = p_user_id,
      guest_session_id = NULL
  WHERE guest_session_id = p_guest_session_id;

  GET DIAGNOSTICS v_feedback_count = ROW_COUNT;

  -- 4. Get unique hive IDs from migrated responses
  -- We query conversations that the user now owns responses in
  SELECT ARRAY_AGG(DISTINCT c.hive_id)
  INTO v_hive_ids
  FROM conversation_responses cr
  JOIN conversations c ON c.id = cr.conversation_id
  WHERE cr.user_id = p_user_id
    AND cr.is_anonymous = p_keep_anonymous;

  -- 5. Auto-join hives (ON CONFLICT DO NOTHING handles existing memberships)
  IF v_hive_ids IS NOT NULL AND array_length(v_hive_ids, 1) > 0 THEN
    INSERT INTO hive_members (hive_id, user_id, role)
    SELECT UNNEST(v_hive_ids), p_user_id, 'member'
    ON CONFLICT (hive_id, user_id) DO NOTHING;
  END IF;

  -- 6. Mark session as converted
  UPDATE guest_sessions
  SET converted_to_user_id = p_user_id,
      converted_at = now()
  WHERE id = p_guest_session_id;

  -- Return migration summary
  RETURN json_build_object(
    'responses_count', v_responses_count,
    'likes_count', v_likes_count,
    'feedback_count', v_feedback_count,
    'hive_ids', COALESCE(v_hive_ids, ARRAY[]::UUID[])
  );
END;
$$;

COMMENT ON FUNCTION migrate_guest_session(UUID, UUID, BOOLEAN)
IS 'Atomically migrate guest session data to a user account';
