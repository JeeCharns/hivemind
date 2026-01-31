-- ============================================
-- 027: Drop duplicate unique index on conversation_analysis_jobs
-- ============================================
-- idx_conversation_analysis_jobs_unique_active (from 002) and
-- uniq_conversation_analysis_jobs_active (from 016) are identical.
-- Keep the original idx_ prefixed one.
-- ============================================

DROP INDEX IF EXISTS uniq_conversation_analysis_jobs_active;
