-- Migration: Add outlier detection support
-- Date: 2025-12-20
-- Description: Adds distance and outlier tracking columns to conversation_responses
--              and allows cluster_index = -1 for miscellaneous/outlier responses

-- 1. Add distance_to_centroid column
-- Stores cosine distance from response embedding to assigned cluster centroid
ALTER TABLE conversation_responses
ADD COLUMN IF NOT EXISTS distance_to_centroid FLOAT DEFAULT NULL;

-- 2. Add outlier_score column (MAD-based z-score)
-- Stores modified z-score for outlier detection
ALTER TABLE conversation_responses
ADD COLUMN IF NOT EXISTS outlier_score FLOAT DEFAULT NULL;

-- 3. Add is_misc boolean column (derived from outlier detection)
-- TRUE if response was marked as outlier/misc based on distance threshold
ALTER TABLE conversation_responses
ADD COLUMN IF NOT EXISTS is_misc BOOLEAN DEFAULT FALSE;

-- 4. Add index for efficient misc filtering
-- Partial index only covers misc responses for query performance
CREATE INDEX IF NOT EXISTS idx_conversation_responses_is_misc
ON conversation_responses(conversation_id, is_misc)
WHERE is_misc = TRUE;

-- 5. Add cluster_index check constraint to allow -1 for misc
-- Drop existing constraint if it exists
ALTER TABLE conversation_responses
DROP CONSTRAINT IF EXISTS conversation_responses_cluster_index_check;

-- Add new constraint: cluster_index can be NULL, -1, or 0+
ALTER TABLE conversation_responses
ADD CONSTRAINT conversation_responses_cluster_index_check
CHECK (cluster_index IS NULL OR cluster_index >= -1);

-- 6. Update conversation_themes to allow -1 cluster_index
-- Drop existing constraint if it exists
ALTER TABLE conversation_themes
DROP CONSTRAINT IF EXISTS conversation_themes_cluster_index_check;

-- Add new constraint: cluster_index can be -1 or 0+
ALTER TABLE conversation_themes
ADD CONSTRAINT conversation_themes_cluster_index_check
CHECK (cluster_index >= -1);

-- Comments for documentation
COMMENT ON COLUMN conversation_responses.distance_to_centroid IS 'Cosine distance from response embedding to assigned cluster centroid (0 = identical, 2 = opposite)';
COMMENT ON COLUMN conversation_responses.outlier_score IS 'MAD-based modified z-score for outlier detection (z > 3.5 = outlier)';
COMMENT ON COLUMN conversation_responses.is_misc IS 'TRUE if response was marked as outlier/misc based on distance threshold';
COMMENT ON COLUMN conversation_responses.cluster_index IS 'Cluster assignment: NULL = unanalyzed, -1 = misc/outlier, 0..N-1 = regular clusters (0 = largest)';
COMMENT ON COLUMN conversation_themes.cluster_index IS 'Cluster index: -1 = misc theme, 0..N-1 = regular themes (0 = largest)';
