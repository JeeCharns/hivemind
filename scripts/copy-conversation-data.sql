-- =============================================================================
-- COPY CONVERSATION DATA BETWEEN DATABASES
-- =============================================================================
-- Target conversation: a90f0609-4919-4393-acac-4ad7dd0c1279
-- Source hive: 32e20e72-5379-44a2-9982-413e1c1618e1
-- Title: "What should we change about our society in a world where work is mostly automated?"
--
-- INSTRUCTIONS:
-- 1. Run the EXPORT queries below against your PRODUCTION database
-- 2. Save each result as a CSV or use the INSERT statements generated
-- 3. Run the IMPORT section against your STAGING database
--
-- NOTE: You may need to adjust hive_id and user references if they differ between environments
-- =============================================================================

-- =============================================================================
-- STEP 1: EXPORT FROM PRODUCTION
-- Run these queries in your production Supabase SQL Editor
-- =============================================================================

-- 1a. Export the conversation record
SELECT * FROM conversations
WHERE id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1b. Export all responses for this conversation
SELECT * FROM conversation_responses
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279'
ORDER BY id;

-- 1c. Export themes
SELECT * FROM conversation_themes
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1d. Export response embeddings
SELECT * FROM conversation_response_embeddings
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1e. Export response groups
SELECT * FROM conversation_response_groups
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1f. Export group members (join to get only members for this conversation)
SELECT gm.* FROM conversation_response_group_members gm
JOIN conversation_response_groups g ON gm.group_id = g.id
WHERE g.conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1g. Export consolidated statements
SELECT * FROM conversation_consolidated_statements
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1h. Export attachments
SELECT * FROM conversation_attachments
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1i. Export analysis jobs
SELECT * FROM conversation_analysis_jobs
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1j. Export cluster models
SELECT * FROM conversation_cluster_models
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1k. Export reports
SELECT * FROM conversation_reports
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1l. Export response feedback
SELECT * FROM response_feedback
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1m. Export response likes (needs join through responses)
SELECT rl.* FROM response_likes rl
JOIN conversation_responses cr ON rl.response_id = cr.id
WHERE cr.conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1n. Export quadratic vote allocations (if this is a 'decide' conversation)
SELECT * FROM quadratic_vote_allocations
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- 1o. Export quadratic vote budgets
SELECT * FROM quadratic_vote_budgets
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- =============================================================================
-- STEP 2: CHECK IF HIVE EXISTS IN STAGING
-- Run this in your STAGING database first
-- =============================================================================

-- Check if the hive exists in staging
SELECT id, name FROM hives WHERE id = '32e20e72-5379-44a2-9982-413e1c1618e1';

-- If the hive doesn't exist, you'll need to either:
-- A) Copy the hive first (see below)
-- B) Use a different hive_id that exists in staging

-- To copy the hive (run in PRODUCTION first to get the data):
SELECT * FROM hives WHERE id = '32e20e72-5379-44a2-9982-413e1c1618e1';

-- =============================================================================
-- ALTERNATIVE: GENERATE INSERT STATEMENTS (Easier for manual copy)
-- Run this in PRODUCTION to generate INSERT statements you can run in STAGING
-- =============================================================================

-- Generate INSERT for conversation (you may need to adjust hive_id)
SELECT format(
    'INSERT INTO conversations (id, hive_id, title, type, phase, analysis_status, description, slug, created_at, updated_at, source_conversation_id, created_by) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L) ON CONFLICT (id) DO NOTHING;',
    id, hive_id, title, type, phase, analysis_status, description, slug, created_at, updated_at, source_conversation_id, created_by
) AS insert_statement
FROM conversations
WHERE id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- Generate INSERTs for responses
SELECT format(
    'INSERT INTO conversation_responses (id, conversation_id, user_id, response_text, tag, cluster_index, x, y, is_outlier, outlier_reason, created_at, updated_at, import_batch_id) VALUES (%s, %L, %L, %L, %L, %s, %s, %s, %L, %L, %L, %L, %L) ON CONFLICT (id) DO NOTHING;',
    id, conversation_id, user_id, response_text, tag, COALESCE(cluster_index::text, 'NULL'), COALESCE(x::text, 'NULL'), COALESCE(y::text, 'NULL'), is_outlier, outlier_reason, created_at, updated_at, import_batch_id
) AS insert_statement
FROM conversation_responses
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279'
ORDER BY id;

-- Generate INSERTs for themes
SELECT format(
    'INSERT INTO conversation_themes (id, conversation_id, cluster_index, name, description, size, avg_similarity, created_at) VALUES (%L, %L, %s, %L, %L, %s, %s, %L) ON CONFLICT (id) DO NOTHING;',
    id, conversation_id, cluster_index, name, description, size, avg_similarity, created_at
) AS insert_statement
FROM conversation_themes
WHERE conversation_id = 'a90f0609-4919-4393-acac-4ad7dd0c1279';

-- =============================================================================
-- STEP 3: IMPORT INTO STAGING
-- After exporting, run the INSERT statements in STAGING
-- Order matters due to foreign key constraints!
-- =============================================================================

-- IMPORTANT: Before importing, temporarily disable RLS if you're having permission issues:
-- ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE conversation_responses DISABLE ROW LEVEL SECURITY;
-- (etc. for each table)
-- Remember to re-enable after import!

-- The import order should be:
-- 1. hives (if not already present)
-- 2. conversations
-- 3. conversation_responses
-- 4. conversation_themes
-- 5. conversation_response_embeddings
-- 6. conversation_response_groups
-- 7. conversation_response_group_members
-- 8. conversation_consolidated_statements
-- 9. conversation_attachments
-- 10. conversation_analysis_jobs
-- 11. conversation_cluster_models
-- 12. conversation_reports
-- 13. response_feedback
-- 14. response_likes
-- 15. quadratic_vote_allocations
-- 16. quadratic_vote_budgets

-- =============================================================================
-- CLEANUP: Re-enable RLS after import
-- =============================================================================
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE conversation_responses ENABLE ROW LEVEL SECURITY;
-- (etc.)
