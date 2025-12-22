-- Migration: Add response grouping support for "Frequently Mentioned" feature
-- Date: 2025-12-20
-- Description: Adds tables for persisting embeddings and response groups (near-duplicate detection)

-- 1. Create conversation_response_embeddings table
-- Persists embeddings for cosine similarity grouping
CREATE TABLE IF NOT EXISTS conversation_response_embeddings (
  response_id BIGINT NOT NULL REFERENCES conversation_responses(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  embedding FLOAT4[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (response_id)
);

CREATE INDEX IF NOT EXISTS idx_response_embeddings_conversation
ON conversation_response_embeddings(conversation_id);

COMMENT ON TABLE conversation_response_embeddings IS 'Persisted response embeddings for similarity grouping';
COMMENT ON COLUMN conversation_response_embeddings.embedding IS 'OpenAI embedding vector (normalized to unit length)';

-- Enable RLS
ALTER TABLE conversation_response_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can view embeddings for conversations in their hives
CREATE POLICY "Users can view embeddings for conversations in their hives"
ON conversation_response_embeddings
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    INNER JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = conversation_response_embeddings.conversation_id
      AND hm.user_id = auth.uid()
  )
);

-- 2. Create conversation_response_groups table
-- Stores "frequently mentioned" groups (near-duplicates within a theme)
CREATE TABLE IF NOT EXISTS conversation_response_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  cluster_index INTEGER NOT NULL,
  representative_response_id BIGINT NOT NULL REFERENCES conversation_responses(id) ON DELETE CASCADE,
  group_size INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  params JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_response_groups_conversation
ON conversation_response_groups(conversation_id);

CREATE INDEX IF NOT EXISTS idx_response_groups_cluster
ON conversation_response_groups(conversation_id, cluster_index);

CREATE INDEX IF NOT EXISTS idx_response_groups_representative
ON conversation_response_groups(representative_response_id);

COMMENT ON TABLE conversation_response_groups IS 'Frequently mentioned response groups (near-duplicates within themes)';
COMMENT ON COLUMN conversation_response_groups.cluster_index IS 'Theme cluster index this group belongs to';
COMMENT ON COLUMN conversation_response_groups.representative_response_id IS 'Representative response ID (most characteristic)';
COMMENT ON COLUMN conversation_response_groups.group_size IS 'Number of responses in this group';
COMMENT ON COLUMN conversation_response_groups.params IS 'Grouping parameters: sim_threshold, min_group_size, algorithm_version';

-- Enable RLS
ALTER TABLE conversation_response_groups ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can view groups for conversations in their hives
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

-- 3. Create conversation_response_group_members join table
-- Normalized many-to-many mapping of responses to groups
CREATE TABLE IF NOT EXISTS conversation_response_group_members (
  group_id UUID NOT NULL REFERENCES conversation_response_groups(id) ON DELETE CASCADE,
  response_id BIGINT NOT NULL REFERENCES conversation_responses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, response_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_response
ON conversation_response_group_members(response_id);

CREATE INDEX IF NOT EXISTS idx_group_members_group
ON conversation_response_group_members(group_id);

COMMENT ON TABLE conversation_response_group_members IS 'Membership mapping for response groups';

-- Enable RLS
ALTER TABLE conversation_response_group_members ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can view group members for conversations in their hives
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

-- 4. Add unique constraint to ensure a response belongs to at most one group per conversation
-- (prevents double-counting in group aggregations)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_group_per_response
ON conversation_response_group_members(response_id);
