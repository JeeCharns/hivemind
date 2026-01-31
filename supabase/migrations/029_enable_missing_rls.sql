-- ============================================
-- 029: Enable RLS on tables missing it
-- ============================================
-- Three tables had RLS disabled, exposing them to any authenticated
-- user via PostgREST. This migration enables RLS and adds the
-- necessary policies for user-auth access patterns.
--
-- Access analysis:
--   conversation_cluster_models    — reads via user client, writes via admin
--   conversation_response_embeddings — all access via admin client
--   conversation_analysis_jobs     — INSERT/SELECT/UPDATE/DELETE via user client
--                                    in triggerConversationAnalysis + conversation DELETE
-- ============================================

-- ============================================
-- conversation_cluster_models
-- ============================================
-- Already has a SELECT policy from 000_base_schema.
-- All writes go through admin client (runConversationAnalysis).
ALTER TABLE public.conversation_cluster_models ENABLE ROW LEVEL SECURITY;

-- ============================================
-- conversation_response_embeddings
-- ============================================
-- Already has a SELECT policy from 000_base_schema.
-- All writes go through admin client (runConversationAnalysis).
ALTER TABLE public.conversation_response_embeddings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- conversation_analysis_jobs
-- ============================================
-- User-auth client needs: INSERT, SELECT, UPDATE (trigger flow),
-- DELETE (conversation deletion).
-- Admin/service-role client bypasses RLS.
ALTER TABLE public.conversation_analysis_jobs ENABLE ROW LEVEL SECURITY;

-- Hive members can view analysis jobs for their conversations
CREATE POLICY "Hive members can view analysis jobs"
ON public.conversation_analysis_jobs
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = conversation_analysis_jobs.conversation_id
      AND hm.user_id = (select auth.uid())
  )
);

-- Hive admins can create analysis jobs
CREATE POLICY "Hive admins can create analysis jobs"
ON public.conversation_analysis_jobs
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM conversations c
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = conversation_analysis_jobs.conversation_id
      AND hm.user_id = (select auth.uid())
      AND hm.role = 'admin'
  )
);

-- Hive admins can update analysis jobs (retire stale jobs)
CREATE POLICY "Hive admins can update analysis jobs"
ON public.conversation_analysis_jobs
FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = conversation_analysis_jobs.conversation_id
      AND hm.user_id = (select auth.uid())
      AND hm.role = 'admin'
  )
);

-- Hive admins can delete analysis jobs (conversation deletion cascade)
CREATE POLICY "Hive admins can delete analysis jobs"
ON public.conversation_analysis_jobs
FOR DELETE USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = conversation_analysis_jobs.conversation_id
      AND hm.user_id = (select auth.uid())
      AND hm.role = 'admin'
  )
);
