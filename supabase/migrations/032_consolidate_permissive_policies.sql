-- ============================================
-- 032: Consolidate multiple permissive policies
-- ============================================
-- Fixes "multiple_permissive_policies" linter warnings by removing
-- redundant policies that overlap with existing targeted policies.
--
-- Categories:
--   A. Drop "Service role can manage/manages X" FOR ALL policies
--      — service_role bypasses RLS entirely, so these are no-ops
--   B. Drop old duplicate conversation_responses policies
--      — superseded by policies from 031_tighten_rls_batch_b
--   C. Replace hive_invite_links admin FOR ALL with targeted UPDATE/DELETE
--      — FOR ALL overlaps with existing SELECT + INSERT member policies
--   D. Drop duplicate conversation_responses SELECT policy
-- ============================================

-- ============================================
-- A. Drop redundant service-role FOR ALL policies
-- ============================================

DROP POLICY IF EXISTS "Service role can manage statements"
  ON public.conversation_consolidated_statements;

DROP POLICY IF EXISTS "Service role can manage buckets"
  ON public.conversation_cluster_buckets;

DROP POLICY IF EXISTS "Service role can manage bucket members"
  ON public.conversation_cluster_bucket_members;

DROP POLICY IF EXISTS "Service role can manage unconsolidated responses"
  ON public.conversation_unconsolidated_responses;

DROP POLICY IF EXISTS "Service role manages proposals"
  ON public.decision_proposals;

DROP POLICY IF EXISTS "Service role manages rounds"
  ON public.decision_rounds;

DROP POLICY IF EXISTS "Service role manages votes"
  ON public.decision_votes;

DROP POLICY IF EXISTS "Service role manages results"
  ON public.decision_results;

-- ============================================
-- B. Drop old duplicate conversation_responses policies
-- ============================================
-- "insert own response" (from 000/026) is superseded by
-- "conversation_responses_insert_hive_member" (from 031)

DROP POLICY IF EXISTS "insert own response"
  ON public.conversation_responses;

-- ============================================
-- C. Replace hive_invite_links admin FOR ALL with targeted policies
-- ============================================
-- "Admins can manage hive invite links" is FOR ALL, which creates
-- overlapping SELECT (with "Members can view") and INSERT (with
-- "Members can create"). Replace with UPDATE + DELETE only.

DROP POLICY IF EXISTS "Admins can manage hive invite links"
  ON public.hive_invite_links;

CREATE POLICY "Admins can update hive invite links" ON public.hive_invite_links
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete hive invite links" ON public.hive_invite_links
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

-- ============================================
-- D. Drop duplicate conversation_responses SELECT policy
-- ============================================
-- "read conversation responses" (from 000) duplicates
-- "conversation_responses_select_all_authenticated" (also from 000)

DROP POLICY IF EXISTS "read conversation responses"
  ON public.conversation_responses;
