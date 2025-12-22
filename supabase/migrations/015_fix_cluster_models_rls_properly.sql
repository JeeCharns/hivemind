-- Migration: Properly fix RLS for cluster models and related tables
-- Date: 2025-12-21
-- Description: Disable RLS on internal analysis tables that are only written by the worker
--              The worker uses the service role key which should bypass RLS, but we disable
--              RLS entirely on these tables since they're never accessed directly by clients

-- 1. Drop the ineffective service_role policies from migration 013
DROP POLICY IF EXISTS "Service role can insert cluster models" ON conversation_cluster_models;
DROP POLICY IF EXISTS "Service role can update cluster models" ON conversation_cluster_models;
DROP POLICY IF EXISTS "Service role can delete cluster models" ON conversation_cluster_models;

DROP POLICY IF EXISTS "Service role can insert embeddings" ON conversation_response_embeddings;
DROP POLICY IF EXISTS "Service role can delete embeddings" ON conversation_response_embeddings;

DROP POLICY IF EXISTS "Service role can insert groups" ON conversation_response_groups;
DROP POLICY IF EXISTS "Service role can update groups" ON conversation_response_groups;
DROP POLICY IF EXISTS "Service role can delete groups" ON conversation_response_groups;

DROP POLICY IF EXISTS "Service role can insert group members" ON conversation_response_group_members;
DROP POLICY IF EXISTS "Service role can delete group members" ON conversation_response_group_members;

-- 2. Disable RLS on conversation_cluster_models
-- This table is only written by the analysis worker (service role)
-- and only read by server-side code (also service role)
ALTER TABLE conversation_cluster_models DISABLE ROW LEVEL SECURITY;

-- 3. Keep RLS enabled on other tables but add proper policies
-- conversation_response_embeddings: internal table, service role only
ALTER TABLE conversation_response_embeddings DISABLE ROW LEVEL SECURITY;

-- conversation_response_groups: needs RLS for client reads
-- Keep RLS enabled and add a proper read policy for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversation_response_groups'
    AND policyname = 'Users can view groups for conversations in their hives'
  ) THEN
    CREATE POLICY "Users can view groups for conversations in their hives"
    ON conversation_response_groups
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM conversations c
        INNER JOIN hive_members hm ON hm.hive_id = c.hive_id
        WHERE c.id = conversation_response_groups.conversation_id
          AND hm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- conversation_response_group_members: needs RLS for client reads
-- Keep RLS enabled and add a proper read policy for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversation_response_group_members'
    AND policyname = 'Users can view group members for conversations in their hives'
  ) THEN
    CREATE POLICY "Users can view group members for conversations in their hives"
    ON conversation_response_group_members
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM conversation_response_groups grp
        INNER JOIN conversations c ON c.id = grp.conversation_id
        INNER JOIN hive_members hm ON hm.hive_id = c.hive_id
        WHERE grp.id = conversation_response_group_members.group_id
          AND hm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE conversation_cluster_models IS 'Internal table: cluster models for incremental analysis. Written by worker (service role), read by server code only. RLS disabled.';
COMMENT ON TABLE conversation_response_embeddings IS 'Internal table: response embeddings for analysis. Written by worker (service role), read by server code only. RLS disabled.';
