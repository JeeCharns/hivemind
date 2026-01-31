-- ============================================
-- 026: Fix RLS init-plan performance
-- ============================================
-- Wraps auth.uid() → (select auth.uid()) and auth.role() → (select auth.role())
-- so Postgres evaluates the function once per query instead of once per row.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- ============================================

-- ============================================
-- hive_invites
-- ============================================

DROP POLICY IF EXISTS "Admins can create hive invites" ON public.hive_invites;
CREATE POLICY "Admins can create hive invites" ON public.hive_invites
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invites.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete hive invites" ON public.hive_invites;
CREATE POLICY "Admins can delete hive invites" ON public.hive_invites
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invites.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update hive invites" ON public.hive_invites;
CREATE POLICY "Admins can update hive invites" ON public.hive_invites
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invites.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view hive invites" ON public.hive_invites;
CREATE POLICY "Admins can view hive invites" ON public.hive_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invites.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

-- ============================================
-- hive_invite_links
-- ============================================

DROP POLICY IF EXISTS "Admins can manage hive invite links" ON public.hive_invite_links;
CREATE POLICY "Admins can manage hive invite links" ON public.hive_invite_links
  USING (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = (select auth.uid())
        AND hive_members.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Members can view hive invite links" ON public.hive_invite_links;
CREATE POLICY "Members can view hive invite links" ON public.hive_invite_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members can create hive invite links" ON public.hive_invite_links;
CREATE POLICY "Members can create hive invite links" ON public.hive_invite_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = (select auth.uid())
    )
  );

-- ============================================
-- conversation_response_group_members
-- ============================================

DROP POLICY IF EXISTS "Users can view group members for conversations in their hives" ON public.conversation_response_group_members;
CREATE POLICY "Users can view group members for conversations in their hives" ON public.conversation_response_group_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM conversation_response_groups grp
      JOIN conversations c ON c.id = grp.conversation_id
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE grp.id = conversation_response_group_members.group_id
        AND hm.user_id = (select auth.uid())
    )
  );

-- ============================================
-- conversation_response_groups
-- ============================================

DROP POLICY IF EXISTS "Users can view groups for conversations in their hives" ON public.conversation_response_groups;
CREATE POLICY "Users can view groups for conversations in their hives" ON public.conversation_response_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = conversation_response_groups.conversation_id
        AND hm.user_id = (select auth.uid())
    )
  );

-- ============================================
-- conversation_responses
-- ============================================

DROP POLICY IF EXISTS "insert own response" ON public.conversation_responses;
CREATE POLICY "insert own response" ON public.conversation_responses
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- ============================================
-- conversation_reports
-- ============================================

DROP POLICY IF EXISTS "insert reports admins" ON public.conversation_reports;
CREATE POLICY "insert reports admins" ON public.conversation_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = conversation_reports.conversation_id
        AND hm.user_id = (select auth.uid())
        AND hm.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "read latest reports" ON public.conversation_reports;
CREATE POLICY "read latest reports" ON public.conversation_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = conversation_reports.conversation_id
        AND hm.user_id = (select auth.uid())
    )
  );

-- ============================================
-- response_likes
-- ============================================

DROP POLICY IF EXISTS "like response" ON public.response_likes;
CREATE POLICY "like response" ON public.response_likes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "unlike own" ON public.response_likes;
CREATE POLICY "unlike own" ON public.response_likes
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- conversation_cluster_models
-- ============================================

DROP POLICY IF EXISTS "Users can view cluster models for conversations in their hives" ON public.conversation_cluster_models;
CREATE POLICY "Users can view cluster models for conversations in their hives" ON public.conversation_cluster_models
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = conversation_cluster_models.conversation_id
        AND hm.user_id = (select auth.uid())
    )
  );

-- ============================================
-- conversation_response_embeddings
-- ============================================

DROP POLICY IF EXISTS "Users can view embeddings for conversations in their hives" ON public.conversation_response_embeddings;
CREATE POLICY "Users can view embeddings for conversations in their hives" ON public.conversation_response_embeddings
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = conversation_response_embeddings.conversation_id
        AND hm.user_id = (select auth.uid())
    )
  );

-- ============================================
-- conversation_consolidated_statements
-- ============================================

DROP POLICY IF EXISTS "Users can view statements for conversations in their hives" ON public.conversation_consolidated_statements;
CREATE POLICY "Users can view statements for conversations in their hives" ON public.conversation_consolidated_statements
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = conversation_consolidated_statements.conversation_id
        AND hm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role can manage statements" ON public.conversation_consolidated_statements;
CREATE POLICY "Service role can manage statements" ON public.conversation_consolidated_statements
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ============================================
-- conversation_cluster_buckets
-- ============================================

DROP POLICY IF EXISTS "Users can view buckets for conversations in their hives" ON public.conversation_cluster_buckets;
CREATE POLICY "Users can view buckets for conversations in their hives" ON public.conversation_cluster_buckets
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = conversation_cluster_buckets.conversation_id
        AND hm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role can manage buckets" ON public.conversation_cluster_buckets;
CREATE POLICY "Service role can manage buckets" ON public.conversation_cluster_buckets
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ============================================
-- conversation_cluster_bucket_members
-- ============================================

DROP POLICY IF EXISTS "Users can view bucket members for conversations in their hives" ON public.conversation_cluster_bucket_members;
CREATE POLICY "Users can view bucket members for conversations in their hives" ON public.conversation_cluster_bucket_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM conversation_cluster_buckets b
      JOIN conversations c ON c.id = b.conversation_id
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE b.id = conversation_cluster_bucket_members.bucket_id
        AND hm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role can manage bucket members" ON public.conversation_cluster_bucket_members;
CREATE POLICY "Service role can manage bucket members" ON public.conversation_cluster_bucket_members
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ============================================
-- conversation_unconsolidated_responses
-- ============================================

DROP POLICY IF EXISTS "Users can view unconsolidated responses for conversations in their hives" ON public.conversation_unconsolidated_responses;
CREATE POLICY "Users can view unconsolidated responses for conversations in their hives" ON public.conversation_unconsolidated_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = conversation_unconsolidated_responses.conversation_id
        AND hm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role can manage unconsolidated responses" ON public.conversation_unconsolidated_responses;
CREATE POLICY "Service role can manage unconsolidated responses" ON public.conversation_unconsolidated_responses
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ============================================
-- decision_proposals
-- ============================================

DROP POLICY IF EXISTS "Hive members can view proposals" ON public.decision_proposals;
CREATE POLICY "Hive members can view proposals" ON public.decision_proposals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = decision_proposals.conversation_id
        AND hm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role manages proposals" ON public.decision_proposals;
CREATE POLICY "Service role manages proposals" ON public.decision_proposals
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ============================================
-- decision_rounds
-- ============================================

DROP POLICY IF EXISTS "Hive members can view rounds" ON public.decision_rounds;
CREATE POLICY "Hive members can view rounds" ON public.decision_rounds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE c.id = decision_rounds.conversation_id
        AND hm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role manages rounds" ON public.decision_rounds;
CREATE POLICY "Service role manages rounds" ON public.decision_rounds
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ============================================
-- decision_votes
-- ============================================

DROP POLICY IF EXISTS "Users can view own votes" ON public.decision_votes;
CREATE POLICY "Users can view own votes" ON public.decision_votes
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Transparent rounds show all votes" ON public.decision_votes;
CREATE POLICY "Transparent rounds show all votes" ON public.decision_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM decision_rounds dr
      JOIN conversations c ON c.id = dr.conversation_id
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE dr.id = decision_votes.round_id
        AND dr.visibility = 'transparent'
        AND hm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role manages votes" ON public.decision_votes;
CREATE POLICY "Service role manages votes" ON public.decision_votes
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ============================================
-- decision_results
-- ============================================

DROP POLICY IF EXISTS "Hive members can view results" ON public.decision_results;
CREATE POLICY "Hive members can view results" ON public.decision_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM decision_rounds dr
      JOIN conversations c ON c.id = dr.conversation_id
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE dr.id = decision_results.round_id
        AND hm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role manages results" ON public.decision_results;
CREATE POLICY "Service role manages results" ON public.decision_results
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');
