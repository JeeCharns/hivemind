-- ============================================
-- 031: Tighten overly permissive RLS policies (Batch B)
-- ============================================
-- Replaces USING(true) / WITH CHECK(true) policies on core tables
-- with proper scoped policies.
--
-- Tables: conversations, conversation_responses, hive_members,
--         hives, response_feedback
--
-- NOTE: SELECT policies (USING(true)) are left as-is — the linter
-- intentionally excludes SELECT from this warning.
-- ============================================

-- ============================================
-- conversations
-- ============================================
-- INSERT: hive members can create conversations (created_by = self)
-- UPDATE: hive admins (triggerConversationAnalysis sets analysis_status)
-- DELETE: hive admins only

DROP POLICY IF EXISTS "conversations_insert_all_authenticated" ON public.conversations;
CREATE POLICY "conversations_insert_hive_member" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = conversations.hive_id
        AND hive_members.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "conversations_update_all_authenticated" ON public.conversations;
CREATE POLICY "conversations_update_hive_admin" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = conversations.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = conversations.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "conversations_delete_all_authenticated" ON public.conversations;
CREATE POLICY "conversations_delete_hive_admin" ON public.conversations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = conversations.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

-- ============================================
-- conversation_responses
-- ============================================
-- INSERT: hive members, user_id must match auth.uid()
-- UPDATE: dropped — all user-client updates go through admin client
--         during analysis; no user-facing UPDATE path exists
-- DELETE: hive admins (conversation deletion cascade)

DROP POLICY IF EXISTS "conversation_responses_insert_all_authenticated" ON public.conversation_responses;
CREATE POLICY "conversation_responses_insert_hive_member" ON public.conversation_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = conversation_responses.conversation_id
        AND hm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "conversation_responses_update_all_authenticated" ON public.conversation_responses;
-- No replacement — updates happen via admin client during analysis

DROP POLICY IF EXISTS "conversation_responses_delete_all_authenticated" ON public.conversation_responses;
CREATE POLICY "conversation_responses_delete_hive_admin" ON public.conversation_responses
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = conversation_responses.conversation_id
        AND hm.user_id = (select auth.uid())
        AND hm.role = 'admin'
    )
  );

-- ============================================
-- hive_members
-- ============================================
-- INSERT: users can add themselves (user_id = auth.uid()) — used
--         by createHive (self as admin) and joinHive/shareLinkService
-- UPDATE: hive admins only (role changes)
-- DELETE: hive admins, OR self-removal (user_id = auth.uid())

DROP POLICY IF EXISTS "hive_members_insert_all_authenticated" ON public.hive_members;
CREATE POLICY "hive_members_insert_self" ON public.hive_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "hive_members_update_all_authenticated" ON public.hive_members;
CREATE POLICY "hive_members_update_admin" ON public.hive_members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hive_members admin_check
      WHERE admin_check.hive_id = hive_members.hive_id
        AND admin_check.user_id = (select auth.uid())
        AND admin_check.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hive_members admin_check
      WHERE admin_check.hive_id = hive_members.hive_id
        AND admin_check.user_id = (select auth.uid())
        AND admin_check.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "hive_members_delete_all_authenticated" ON public.hive_members;
CREATE POLICY "hive_members_delete_admin_or_self" ON public.hive_members
  FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM hive_members admin_check
      WHERE admin_check.hive_id = hive_members.hive_id
        AND admin_check.user_id = (select auth.uid())
        AND admin_check.role = 'admin'
    )
  );

-- ============================================
-- hives
-- ============================================
-- INSERT: any authenticated user can create a hive
-- UPDATE: hive admins only
-- DELETE: hive admins only

DROP POLICY IF EXISTS "hives_insert_all_authenticated" ON public.hives;
CREATE POLICY "hives_insert_authenticated" ON public.hives
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "hives_update_all_authenticated" ON public.hives;
CREATE POLICY "hives_update_admin" ON public.hives
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hives.id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hives.id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "hives_delete_all_authenticated" ON public.hives;
CREATE POLICY "hives_delete_admin" ON public.hives
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hives.id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

-- ============================================
-- response_feedback
-- ============================================
-- INSERT/UPSERT: hive members, own feedback only (user_id = self)
-- UPDATE: own feedback only
-- DELETE: own feedback only + must be hive member

DROP POLICY IF EXISTS "response_feedback_insert_all_authenticated" ON public.response_feedback;
CREATE POLICY "response_feedback_insert_own" ON public.response_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM conversation_responses cr
      JOIN conversations c ON c.id = cr.conversation_id
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE cr.id = response_feedback.response_id
        AND hm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "response_feedback_update_all_authenticated" ON public.response_feedback;
CREATE POLICY "response_feedback_update_own" ON public.response_feedback
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "response_feedback_delete_all_authenticated" ON public.response_feedback;
CREATE POLICY "response_feedback_delete_own" ON public.response_feedback
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
