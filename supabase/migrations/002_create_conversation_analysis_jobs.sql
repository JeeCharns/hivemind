-- Create conversation_analysis_jobs table for async job tracking
-- Provides idempotency and concurrency safety for analysis jobs

CREATE TABLE IF NOT EXISTS conversation_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  last_error TEXT
);

-- Index for efficient job queries
CREATE INDEX idx_conversation_analysis_jobs_conversation_id ON conversation_analysis_jobs(conversation_id);
CREATE INDEX idx_conversation_analysis_jobs_status ON conversation_analysis_jobs(status);

-- Unique constraint to prevent duplicate active jobs
-- Only one job can be queued or running for a conversation at a time
CREATE UNIQUE INDEX idx_conversation_analysis_jobs_unique_active 
  ON conversation_analysis_jobs(conversation_id) 
  WHERE status IN ('queued', 'running');

-- Add import_batch_id to conversation_responses for idempotency
ALTER TABLE conversation_responses 
  ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- Create index for import batch queries
CREATE INDEX IF NOT EXISTS idx_conversation_responses_import_batch_id 
  ON conversation_responses(import_batch_id);

-- Add analysis_error column to conversations if it doesn't exist
ALTER TABLE conversations 
  ADD COLUMN IF NOT EXISTS analysis_error TEXT;

-- Add created_by column to conversations if it doesn't exist  
ALTER TABLE conversations 
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
