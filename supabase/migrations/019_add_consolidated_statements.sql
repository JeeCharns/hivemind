-- Migration: 019_add_consolidated_statements
-- Purpose: Add table for LLM-synthesized consolidated statements
--
-- This table stores synthesized statements that combine similar responses
-- within topic clusters. Each group from conversation_response_groups can
-- have one consolidated statement with full provenance tracking.

-- Consolidated statements table
CREATE TABLE IF NOT EXISTS conversation_consolidated_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES conversation_response_groups(id) ON DELETE CASCADE,

  -- Synthesized content
  synthesized_statement TEXT NOT NULL,

  -- Traceability / Provenance
  combined_response_ids BIGINT[] NOT NULL,  -- Array of response IDs that were combined
  combined_responses TEXT NOT NULL,          -- "id: text | id: text" format for display

  -- Metadata for observability
  model_used TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  prompt_version TEXT NOT NULL DEFAULT 'v1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One consolidated statement per group
  CONSTRAINT unique_statement_per_group UNIQUE (group_id)
);

-- Index for fetching all statements for a conversation
CREATE INDEX IF NOT EXISTS idx_consolidated_statements_conversation
ON conversation_consolidated_statements(conversation_id);

-- Index for looking up statement by group
CREATE INDEX IF NOT EXISTS idx_consolidated_statements_group
ON conversation_consolidated_statements(group_id);

-- Enable Row Level Security
ALTER TABLE conversation_consolidated_statements ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view statements for conversations in their hives
CREATE POLICY "Users can view statements for conversations in their hives"
ON conversation_consolidated_statements
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    INNER JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = conversation_consolidated_statements.conversation_id
      AND hm.user_id = auth.uid()
  )
);

-- Service role policy for insert/update/delete during analysis
CREATE POLICY "Service role can manage statements"
ON conversation_consolidated_statements
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
