-- Migration: Create guest_sessions table + alter responses/likes/feedback for guest support
-- Supports pseudo-anonymous "Guest N" identity for share link visitors

-- ============================================================
-- Table: guest_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."guest_sessions" (
    "id"                uuid DEFAULT gen_random_uuid() NOT NULL,
    "share_link_id"     uuid NOT NULL,
    "guest_number"      integer NOT NULL,
    "session_token_hash" text NOT NULL,
    "created_at"        timestamptz DEFAULT now() NOT NULL,
    "expires_at"        timestamptz NOT NULL,

    CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guest_sessions_share_link_id_guest_number_key"
        UNIQUE ("share_link_id", "guest_number"),
    CONSTRAINT "guest_sessions_share_link_id_fkey"
        FOREIGN KEY ("share_link_id")
        REFERENCES "public"."conversation_share_links"("id") ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_guest_sessions_share_link_id
    ON "public"."guest_sessions" ("share_link_id");
CREATE INDEX idx_guest_sessions_session_token_hash
    ON "public"."guest_sessions" ("session_token_hash");

-- RLS: guest_sessions is server-only (via service role), no user policies
ALTER TABLE "public"."guest_sessions" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Alter: conversation_responses — add guest_session_id
-- ============================================================
ALTER TABLE "public"."conversation_responses"
    ADD COLUMN IF NOT EXISTS "guest_session_id" uuid;

ALTER TABLE "public"."conversation_responses"
    ADD CONSTRAINT "conversation_responses_guest_session_id_fkey"
    FOREIGN KEY ("guest_session_id")
    REFERENCES "public"."guest_sessions"("id") ON DELETE SET NULL;

CREATE INDEX idx_conversation_responses_guest_session_id
    ON "public"."conversation_responses" ("guest_session_id");

-- ============================================================
-- Alter: response_likes — add guest_session_id
-- ============================================================
ALTER TABLE "public"."response_likes"
    ADD COLUMN IF NOT EXISTS "guest_session_id" uuid;

ALTER TABLE "public"."response_likes"
    ADD CONSTRAINT "response_likes_guest_session_id_fkey"
    FOREIGN KEY ("guest_session_id")
    REFERENCES "public"."guest_sessions"("id") ON DELETE SET NULL;

CREATE INDEX idx_response_likes_guest_session_id
    ON "public"."response_likes" ("guest_session_id");

-- For guest likes, we need a unique constraint on (response_id, guest_session_id)
-- but only when guest_session_id is not null. Use a partial unique index.
CREATE UNIQUE INDEX idx_response_likes_response_guest_unique
    ON "public"."response_likes" ("response_id", "guest_session_id")
    WHERE "guest_session_id" IS NOT NULL;

-- ============================================================
-- Alter: response_feedback — add guest_session_id
-- ============================================================
ALTER TABLE "public"."response_feedback"
    ADD COLUMN IF NOT EXISTS "guest_session_id" uuid;

ALTER TABLE "public"."response_feedback"
    ADD CONSTRAINT "response_feedback_guest_session_id_fkey"
    FOREIGN KEY ("guest_session_id")
    REFERENCES "public"."guest_sessions"("id") ON DELETE SET NULL;

CREATE INDEX idx_response_feedback_guest_session_id
    ON "public"."response_feedback" ("guest_session_id");

-- For guest feedback, unique constraint on (conversation_id, response_id, guest_session_id)
CREATE UNIQUE INDEX idx_response_feedback_conv_resp_guest_unique
    ON "public"."response_feedback" ("conversation_id", "response_id", "guest_session_id")
    WHERE "guest_session_id" IS NOT NULL;
