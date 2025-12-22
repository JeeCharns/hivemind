-- Migration: Fix RLS policies for cluster models and response groups
-- Date: 2025-12-20
-- Description: Allow service role to write to cluster models and response groups tables

-- 1. Add service role write policies for conversation_cluster_models
-- The analysis worker uses service role, so we need to allow writes
CREATE POLICY "Service role can insert cluster models"
ON conversation_cluster_models
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update cluster models"
ON conversation_cluster_models
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can delete cluster models"
ON conversation_cluster_models
FOR DELETE
TO service_role
USING (true);

-- 2. Add service role write policies for conversation_response_embeddings
CREATE POLICY "Service role can insert embeddings"
ON conversation_response_embeddings
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can delete embeddings"
ON conversation_response_embeddings
FOR DELETE
TO service_role
USING (true);

-- 3. Add service role write policies for conversation_response_groups
CREATE POLICY "Service role can insert groups"
ON conversation_response_groups
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update groups"
ON conversation_response_groups
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can delete groups"
ON conversation_response_groups
FOR DELETE
TO service_role
USING (true);

-- 4. Add service role write policies for conversation_response_group_members
CREATE POLICY "Service role can insert group members"
ON conversation_response_group_members
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can delete group members"
ON conversation_response_group_members
FOR DELETE
TO service_role
USING (true);

COMMENT ON POLICY "Service role can insert cluster models" ON conversation_cluster_models IS 'Analysis worker needs to write cluster models';
COMMENT ON POLICY "Service role can insert embeddings" ON conversation_response_embeddings IS 'Analysis worker needs to persist embeddings';
COMMENT ON POLICY "Service role can insert groups" ON conversation_response_groups IS 'Analysis worker needs to create response groups';
COMMENT ON POLICY "Service role can insert group members" ON conversation_response_group_members IS 'Analysis worker needs to populate group membership';
