-- ============================================
-- 030: Tighten overly permissive RLS policies (Batch A)
-- ============================================
-- Replaces USING(true) / WITH CHECK(true) policies on low-risk
-- tables with proper scoped policies.
--
-- Tables: profiles, conversation_themes, conversation_attachments,
--         quadratic_vote_allocations, quadratic_vote_budgets
-- ============================================

-- ============================================
-- profiles
-- ============================================
-- User client: SELECT (display), UPSERT own profile (id = auth.uid())
-- No user should modify another user's profile.
-- SELECT(true) for authenticated is intentional (profiles are public for display).
-- DELETE is not used in production but should be own-only.

DROP POLICY IF EXISTS "profiles_insert_all_authenticated" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_update_all_authenticated" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_delete_all_authenticated" ON public.profiles;
CREATE POLICY "profiles_delete_own" ON public.profiles
  FOR DELETE TO authenticated
  USING (id = (select auth.uid()));

-- ============================================
-- conversation_themes
-- ============================================
-- User client: SELECT only (getUnderstandViewModel).
-- All writes go through admin client (runConversationAnalysis).
-- Drop the write policies entirely — admin client bypasses RLS.

DROP POLICY IF EXISTS "conversation_themes_insert_all_authenticated" ON public.conversation_themes;
DROP POLICY IF EXISTS "conversation_themes_update_all_authenticated" ON public.conversation_themes;
DROP POLICY IF EXISTS "conversation_themes_delete_all_authenticated" ON public.conversation_themes;

-- ============================================
-- conversation_attachments
-- ============================================
-- Not actively used in production routes. All known access is via
-- admin/scripts. Drop the wide-open policies; if user-facing
-- attachment features are added later, proper policies should be
-- created at that time.

DROP POLICY IF EXISTS "conversation_attachments_insert_all_authenticated" ON public.conversation_attachments;
DROP POLICY IF EXISTS "conversation_attachments_update_all_authenticated" ON public.conversation_attachments;
DROP POLICY IF EXISTS "conversation_attachments_delete_all_authenticated" ON public.conversation_attachments;

-- ============================================
-- quadratic_vote_allocations
-- ============================================
-- User client: SELECT own votes only (getUserVotes).
-- All writes go through vote_on_proposal RPC (SECURITY DEFINER,
-- bypasses RLS). Drop the wide-open write policies.

DROP POLICY IF EXISTS "qv_allocations_insert_all_authenticated" ON public.quadratic_vote_allocations;
DROP POLICY IF EXISTS "qv_allocations_update_all_authenticated" ON public.quadratic_vote_allocations;
DROP POLICY IF EXISTS "qv_allocations_delete_all_authenticated" ON public.quadratic_vote_allocations;

-- ============================================
-- quadratic_vote_budgets
-- ============================================
-- User client: SELECT own budget only (getUserVotes).
-- All writes go through vote_on_proposal RPC (SECURITY DEFINER).

DROP POLICY IF EXISTS "qv_budgets_insert_all_authenticated" ON public.quadratic_vote_budgets;
DROP POLICY IF EXISTS "qv_budgets_update_all_authenticated" ON public.quadratic_vote_budgets;
DROP POLICY IF EXISTS "qv_budgets_delete_all_authenticated" ON public.quadratic_vote_budgets;
