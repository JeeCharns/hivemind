-- ============================================
-- 033: Consolidate decision_votes SELECT policies
-- ============================================
-- Merges two permissive SELECT policies into one to eliminate
-- "multiple_permissive_policies" linter warnings.
--
-- Before: "Users can view own votes" (own rows)
--       + "Transparent rounds show all votes" (hive member + transparent round)
-- After:  Single policy combining both conditions with OR.
-- ============================================

DROP POLICY IF EXISTS "Users can view own votes" ON public.decision_votes;
DROP POLICY IF EXISTS "Transparent rounds show all votes" ON public.decision_votes;

CREATE POLICY "Users can view votes" ON public.decision_votes
  FOR SELECT
  USING (
    -- Own votes are always visible
    user_id = (select auth.uid())
    OR
    -- All votes visible in transparent rounds (to hive members)
    EXISTS (
      SELECT 1 FROM decision_rounds dr
      JOIN conversations c ON c.id = dr.conversation_id
      JOIN hive_members hm ON hm.hive_id = c.hive_id
      WHERE dr.id = decision_votes.round_id
        AND dr.visibility = 'transparent'
        AND hm.user_id = (select auth.uid())
    )
  );
