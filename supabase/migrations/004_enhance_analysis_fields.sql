-- Enhance analysis fields for improved tracking and UMAP naming
-- Add analysis_response_count, analysis_updated_at to conversations table
-- Add x_umap, y_umap to conversation_responses (prefer over x, y for clarity)

-- Add tracking fields to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS analysis_response_count INTEGER,
  ADD COLUMN IF NOT EXISTS analysis_updated_at TIMESTAMPTZ;

-- Add UMAP-specific coordinate columns to conversation_responses
ALTER TABLE conversation_responses
  ADD COLUMN IF NOT EXISTS x_umap DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS y_umap DOUBLE PRECISION;

-- Create index for efficient UMAP coordinate queries
CREATE INDEX IF NOT EXISTS idx_conversation_responses_umap
  ON conversation_responses(conversation_id, x_umap, y_umap)
  WHERE x_umap IS NOT NULL AND y_umap IS NOT NULL;

-- Backfill x_umap, y_umap from existing x, y values (if any)
UPDATE conversation_responses
SET
  x_umap = x,
  y_umap = y
WHERE x IS NOT NULL AND y IS NOT NULL AND x_umap IS NULL AND y_umap IS NULL;
