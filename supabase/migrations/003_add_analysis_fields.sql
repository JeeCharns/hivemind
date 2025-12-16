-- Add fields to conversation_responses for analysis results
ALTER TABLE conversation_responses
  ADD COLUMN IF NOT EXISTS x DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS y DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS cluster_index INTEGER;

-- Create index for cluster queries
CREATE INDEX IF NOT EXISTS idx_conversation_responses_cluster
  ON conversation_responses(conversation_id, cluster_index);

-- Create conversation_themes table
CREATE TABLE IF NOT EXISTS conversation_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  cluster_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, cluster_index)
);

-- Index for efficient theme queries
CREATE INDEX IF NOT EXISTS idx_conversation_themes_conversation_id
  ON conversation_themes(conversation_id);
