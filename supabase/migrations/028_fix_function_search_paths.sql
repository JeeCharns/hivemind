-- ============================================
-- 028: Fix function search_path security
-- ============================================
-- Sets search_path on all public functions to prevent
-- search_path hijacking attacks.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
-- ============================================

-- 1. update_hive_invites_updated_at
CREATE OR REPLACE FUNCTION public.update_hive_invites_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. update_hive_invite_links_updated_at
CREATE OR REPLACE FUNCTION public.update_hive_invite_links_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. slugify
CREATE OR REPLACE FUNCTION public.slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  select regexp_replace(lower(trim(input)), '[^a-z0-9]+', '-', 'g');
$$;

-- 4. get_feedback_counts
CREATE OR REPLACE FUNCTION public.get_feedback_counts(p_response_id BIGINT)
RETURNS TABLE(agree INT, pass INT, disagree INT)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE feedback = 'agree')::INT as agree,
    COUNT(*) FILTER (WHERE feedback = 'pass')::INT as pass,
    COUNT(*) FILTER (WHERE feedback = 'disagree')::INT as disagree
  FROM public.response_feedback
  WHERE response_id = p_response_id;
$$;

-- 5. claim_analysis_job
CREATE OR REPLACE FUNCTION public.claim_analysis_job(
  p_job_id UUID,
  p_locked_at TIMESTAMPTZ,
  p_cutoff TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  claimed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE public.conversation_analysis_jobs
  SET
    status = 'running',
    locked_at = p_locked_at,
    updated_at = p_locked_at
  WHERE
    conversation_analysis_jobs.id = p_job_id
    AND (
      (status = 'queued' AND locked_at IS NULL)
      OR (status = 'queued' AND locked_at < p_cutoff)
      OR (status = 'running' AND locked_at IS NULL)
      OR (status = 'running' AND locked_at < p_cutoff)
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    RETURN QUERY SELECT p_job_id, TRUE;
  ELSE
    RETURN QUERY SELECT p_job_id, FALSE;
  END IF;
END;
$$;

-- 6. fetch_next_analysis_job
CREATE OR REPLACE FUNCTION public.fetch_next_analysis_job(
  p_cutoff TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  status TEXT,
  attempts INTEGER,
  strategy TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID,
  last_error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.conversation_id,
    j.status,
    j.attempts,
    j.strategy,
    j.locked_at,
    j.created_at,
    j.updated_at,
    j.created_by,
    j.last_error
  FROM public.conversation_analysis_jobs j
  WHERE
    j.status = 'queued'
    OR (j.status = 'running' AND j.locked_at IS NULL)
    OR (j.status = 'running' AND j.locked_at < p_cutoff)
  ORDER BY j.created_at ASC
  LIMIT 1;
END;
$$;

-- 7. vote_on_proposal
CREATE OR REPLACE FUNCTION public.vote_on_proposal(
  p_conversation_id UUID,
  p_response_id BIGINT,
  p_user_id UUID,
  p_delta INTEGER
)
RETURNS TABLE(success BOOLEAN, new_votes INTEGER, remaining_credits INTEGER, error_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_votes INTEGER;
  v_new_votes INTEGER;
  v_new_cost INTEGER;
  v_current_spend INTEGER;
  v_total_spend INTEGER;
  v_conversation_type TEXT;
  v_response_tag TEXT;
  v_max_budget INTEGER := 99;
  v_hive_id UUID;
  v_budget_total INTEGER;
  v_budget_spent INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_user_id != auth.uid() THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'UNAUTHORIZED_USER';
    RETURN;
  END IF;

  SELECT type, hive_id INTO v_conversation_type, v_hive_id
  FROM conversations
  WHERE id = p_conversation_id;

  IF v_conversation_type IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'CONVERSATION_NOT_FOUND';
    RETURN;
  END IF;

  IF v_conversation_type != 'decide' THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'NOT_DECISION_SESSION';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hive_members
    WHERE hive_id = v_hive_id AND user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'NOT_HIVE_MEMBER';
    RETURN;
  END IF;

  SELECT tag INTO v_response_tag
  FROM conversation_responses
  WHERE id = p_response_id AND conversation_id = p_conversation_id;

  IF v_response_tag IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'RESPONSE_NOT_FOUND';
    RETURN;
  END IF;

  IF v_response_tag != 'proposal' THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'NOT_A_PROPOSAL';
    RETURN;
  END IF;

  SELECT votes INTO v_current_votes
  FROM public.quadratic_vote_allocations
  WHERE conversation_id = p_conversation_id
    AND proposal_response_id = p_response_id
    AND user_id = p_user_id;

  IF v_current_votes IS NULL THEN
    v_current_votes := 0;
  END IF;

  INSERT INTO public.quadratic_vote_budgets (conversation_id, user_id, credits_total, credits_spent)
  VALUES (p_conversation_id, p_user_id, v_max_budget, 0)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  SELECT credits_total, credits_spent
  INTO v_budget_total, v_budget_spent
  FROM public.quadratic_vote_budgets
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_budget_total IS NULL THEN
    RETURN QUERY SELECT FALSE, v_current_votes, 0, 'BUDGET_ROW_MISSING';
    RETURN;
  END IF;

  v_new_votes := v_current_votes + p_delta;

  IF v_new_votes < 0 THEN
    RETURN QUERY SELECT FALSE, v_current_votes, 0, 'NEGATIVE_VOTES';
    RETURN;
  END IF;

  SELECT COALESCE(SUM(votes * votes), 0) INTO v_current_spend
  FROM public.quadratic_vote_allocations
  WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id;

  v_new_cost := (v_new_votes * v_new_votes) - (v_current_votes * v_current_votes);

  v_total_spend := v_current_spend + v_new_cost;
  IF v_total_spend > v_budget_total THEN
    RETURN QUERY SELECT FALSE, v_current_votes, v_budget_total - v_current_spend, 'BUDGET_EXCEEDED';
    RETURN;
  END IF;

  INSERT INTO public.quadratic_vote_allocations (conversation_id, user_id, proposal_response_id, votes, created_at)
  VALUES (p_conversation_id, p_user_id, p_response_id, v_new_votes, now())
  ON CONFLICT (conversation_id, user_id, proposal_response_id)
  DO UPDATE SET votes = EXCLUDED.votes;

  UPDATE public.quadratic_vote_budgets
  SET credits_spent = v_total_spend
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

  RETURN QUERY SELECT TRUE, v_new_votes, v_budget_total - v_total_spend, NULL::TEXT;
END;
$$;

-- 8. vote_on_decision_proposal
CREATE OR REPLACE FUNCTION public.vote_on_decision_proposal(
  p_round_id UUID,
  p_proposal_id UUID,
  p_user_id UUID,
  p_delta INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
  v_hive_id UUID;
  v_round_status decision_round_status;
  v_current_votes INTEGER;
  v_new_votes INTEGER;
  v_current_cost INTEGER;
  v_new_cost INTEGER;
  v_total_spent INTEGER;
  v_budget INTEGER := 99;
BEGIN
  SELECT dr.conversation_id, dr.status, c.hive_id
  INTO v_conversation_id, v_round_status, v_hive_id
  FROM decision_rounds dr
  JOIN conversations c ON c.id = dr.conversation_id
  WHERE dr.id = p_round_id;

  IF v_conversation_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ROUND_NOT_FOUND');
  END IF;

  IF v_round_status != 'voting_open' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ROUND_CLOSED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hive_members
    WHERE hive_id = v_hive_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_HIVE_MEMBER');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM decision_proposals
    WHERE id = p_proposal_id AND conversation_id = v_conversation_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PROPOSAL');
  END IF;

  SELECT COALESCE(votes, 0) INTO v_current_votes
  FROM decision_votes
  WHERE round_id = p_round_id
    AND user_id = p_user_id
    AND proposal_id = p_proposal_id;

  IF v_current_votes IS NULL THEN
    v_current_votes := 0;
  END IF;

  v_new_votes := v_current_votes + p_delta;

  IF v_new_votes < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NEGATIVE_VOTES');
  END IF;

  v_current_cost := v_current_votes * v_current_votes;
  v_new_cost := v_new_votes * v_new_votes;

  SELECT COALESCE(SUM(votes * votes), 0) INTO v_total_spent
  FROM decision_votes
  WHERE round_id = p_round_id
    AND user_id = p_user_id
    AND proposal_id != p_proposal_id;

  IF (v_total_spent + v_new_cost) > v_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BUDGET_EXCEEDED',
      'remaining_credits', v_budget - v_total_spent
    );
  END IF;

  INSERT INTO decision_votes (round_id, user_id, proposal_id, votes, updated_at)
  VALUES (p_round_id, p_user_id, p_proposal_id, v_new_votes, NOW())
  ON CONFLICT (round_id, user_id, proposal_id)
  DO UPDATE SET votes = v_new_votes, updated_at = NOW();

  IF v_new_votes = 0 THEN
    DELETE FROM decision_votes
    WHERE round_id = p_round_id
      AND user_id = p_user_id
      AND proposal_id = p_proposal_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'new_votes', v_new_votes,
    'remaining_credits', v_budget - v_total_spent - v_new_cost
  );
END;
$$;
