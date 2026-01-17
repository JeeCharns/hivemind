-- Migration: 020_add_cluster_consolidation
-- Purpose: Add tables for LLM-driven cluster consolidation
--
-- This replaces the group-based consolidation (019) with cluster-level
-- semantic bucketing. The LLM analyzes all responses in a cluster and
-- creates semantic buckets, then consolidates each bucket into a statement.

-- Semantic buckets within a cluster (created by LLM)
CREATE TABLE IF NOT EXISTS conversation_cluster_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  cluster_index INTEGER NOT NULL,

  -- Bucket metadata
  bucket_name TEXT NOT NULL,              -- Short name like "UBI Support", "Automation Concerns"
  bucket_index INTEGER NOT NULL,          -- Order within cluster (0, 1, 2...)

  -- Consolidated content
  consolidated_statement TEXT NOT NULL,   -- LLM-generated statement

  -- Traceability
  response_count INTEGER NOT NULL,        -- Number of responses in this bucket

  -- Metadata for observability
  model_used TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  prompt_version TEXT NOT NULL DEFAULT 'v2.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique bucket per cluster
  CONSTRAINT unique_bucket_per_cluster UNIQUE (conversation_id, cluster_index, bucket_index)
);

-- Mapping of responses to buckets (for traceability)
CREATE TABLE IF NOT EXISTS conversation_cluster_bucket_members (
  bucket_id UUID NOT NULL REFERENCES conversation_cluster_buckets(id) ON DELETE CASCADE,
  response_id BIGINT NOT NULL REFERENCES conversation_responses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (bucket_id, response_id)
);

-- Responses that couldn't be consolidated (truly unique)
CREATE TABLE IF NOT EXISTS conversation_unconsolidated_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  cluster_index INTEGER NOT NULL,
  response_id BIGINT NOT NULL REFERENCES conversation_responses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One entry per response
  CONSTRAINT unique_unconsolidated_response UNIQUE (conversation_id, response_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_cluster_buckets_conversation
ON conversation_cluster_buckets(conversation_id);

CREATE INDEX IF NOT EXISTS idx_cluster_buckets_cluster
ON conversation_cluster_buckets(conversation_id, cluster_index);

CREATE INDEX IF NOT EXISTS idx_bucket_members_bucket
ON conversation_cluster_bucket_members(bucket_id);

CREATE INDEX IF NOT EXISTS idx_bucket_members_response
ON conversation_cluster_bucket_members(response_id);

CREATE INDEX IF NOT EXISTS idx_unconsolidated_conversation
ON conversation_unconsolidated_responses(conversation_id);

-- Enable Row Level Security
ALTER TABLE conversation_cluster_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_cluster_bucket_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_unconsolidated_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for buckets
CREATE POLICY "Users can view buckets for conversations in their hives"
ON conversation_cluster_buckets
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    INNER JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = conversation_cluster_buckets.conversation_id
      AND hm.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage buckets"
ON conversation_cluster_buckets
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for bucket members
CREATE POLICY "Users can view bucket members for conversations in their hives"
ON conversation_cluster_bucket_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM conversation_cluster_buckets b
    INNER JOIN conversations c ON c.id = b.conversation_id
    INNER JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE b.id = conversation_cluster_bucket_members.bucket_id
      AND hm.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage bucket members"
ON conversation_cluster_bucket_members
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for unconsolidated responses
CREATE POLICY "Users can view unconsolidated responses for conversations in their hives"
ON conversation_unconsolidated_responses
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    INNER JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = conversation_unconsolidated_responses.conversation_id
      AND hm.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage unconsolidated responses"
ON conversation_unconsolidated_responses
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
