-- Migration: Add support for incremental analysis
-- Date: 2025-12-19
-- Description: Adds conversation_cluster_models table and strategy field to jobs

-- 1. Add strategy field to conversation_analysis_jobs
ALTER TABLE conversation_analysis_jobs
ADD COLUMN IF NOT EXISTS strategy TEXT CHECK (strategy IN ('incremental', 'full')) DEFAULT 'full';

-- 2. Add analysis metadata fields to conversations if not exists
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS analysis_response_count INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS analysis_updated_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Create conversation_cluster_models table
-- Stores cluster centroids and stats for incremental updates
CREATE TABLE IF NOT EXISTS conversation_cluster_models (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  cluster_index INTEGER NOT NULL,
  centroid_embedding FLOAT4[] NOT NULL,
  centroid_x_umap FLOAT NOT NULL,
  centroid_y_umap FLOAT NOT NULL,
  spread_radius FLOAT NOT NULL DEFAULT 0.1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, cluster_index)
);

-- 4. Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_cluster_models_conversation
ON conversation_cluster_models(conversation_id);

-- 5. Enable RLS on conversation_cluster_models
ALTER TABLE conversation_cluster_models ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies for conversation_cluster_models
-- Workers use service role, so these are for potential future client reads
CREATE POLICY "Users can view cluster models for conversations in their hives"
ON conversation_cluster_models
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    INNER JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = conversation_cluster_models.conversation_id
      AND hm.user_id = auth.uid()
  )
);

-- No INSERT/UPDATE/DELETE policies - only service role (worker) should write

COMMENT ON TABLE conversation_cluster_models IS 'Persisted cluster models for incremental analysis updates';
COMMENT ON COLUMN conversation_cluster_models.centroid_embedding IS 'Cluster centroid in embedding space (float4[])';
COMMENT ON COLUMN conversation_cluster_models.centroid_x_umap IS 'Cluster centroid X coordinate in 2D UMAP space';
COMMENT ON COLUMN conversation_cluster_models.centroid_y_umap IS 'Cluster centroid Y coordinate in 2D UMAP space';
COMMENT ON COLUMN conversation_cluster_models.spread_radius IS 'Cluster spread radius for jitter placement';
