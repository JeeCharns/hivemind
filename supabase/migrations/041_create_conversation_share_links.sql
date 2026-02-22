-- Migration: Create conversation_share_links table
-- Supports temporary anonymous guest access to individual conversations

-- ============================================================
-- Table: conversation_share_links
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."conversation_share_links" (
    "id"              uuid DEFAULT gen_random_uuid() NOT NULL,
    "conversation_id" uuid NOT NULL,
    "token"           text NOT NULL,
    "expires_at"      timestamptz NOT NULL,
    "is_active"       boolean DEFAULT true NOT NULL,
    "created_by"      uuid NOT NULL,
    "created_at"      timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT "conversation_share_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_share_links_token_key" UNIQUE ("token"),
    CONSTRAINT "conversation_share_links_conversation_id_fkey"
        FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE,
    CONSTRAINT "conversation_share_links_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id")
);

-- Indexes
CREATE INDEX idx_conversation_share_links_token
    ON "public"."conversation_share_links" ("token");
CREATE INDEX idx_conversation_share_links_conversation_id
    ON "public"."conversation_share_links" ("conversation_id");
CREATE INDEX idx_conversation_share_links_created_by
    ON "public"."conversation_share_links" ("created_by");

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE "public"."conversation_share_links" ENABLE ROW LEVEL SECURITY;

-- Members of the hive that owns this conversation can read share links
CREATE POLICY "conversation_share_links_select_policy"
    ON "public"."conversation_share_links"
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM "public"."conversations" c
            JOIN "public"."hive_members" hm ON hm.hive_id = c.hive_id
            WHERE c.id = conversation_share_links.conversation_id
              AND hm.user_id = (SELECT auth.uid())
        )
    );

-- Members of the hive can create share links
CREATE POLICY "conversation_share_links_insert_policy"
    ON "public"."conversation_share_links"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM "public"."conversations" c
            JOIN "public"."hive_members" hm ON hm.hive_id = c.hive_id
            WHERE c.id = conversation_share_links.conversation_id
              AND hm.user_id = (SELECT auth.uid())
        )
    );

-- Members of the hive can update (revoke) share links
CREATE POLICY "conversation_share_links_update_policy"
    ON "public"."conversation_share_links"
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM "public"."conversations" c
            JOIN "public"."hive_members" hm ON hm.hive_id = c.hive_id
            WHERE c.id = conversation_share_links.conversation_id
              AND hm.user_id = (SELECT auth.uid())
        )
    );

-- Members of the hive can delete share links
CREATE POLICY "conversation_share_links_delete_policy"
    ON "public"."conversation_share_links"
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM "public"."conversations" c
            JOIN "public"."hive_members" hm ON hm.hive_id = c.hive_id
            WHERE c.id = conversation_share_links.conversation_id
              AND hm.user_id = (SELECT auth.uid())
        )
    );
