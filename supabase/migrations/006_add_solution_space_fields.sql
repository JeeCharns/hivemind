-- Add solution space (decision session) support
-- This migration adds:
-- 1. Source report linking fields to conversations table
-- 2. Quadratic voting RPC for proposals (reuses existing tables)

-- Add source report fields to conversations table
-- These allow decision sessions to link to a problem space executive summary
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_report_version INTEGER;

-- Add index for efficient source conversation lookups
CREATE INDEX IF NOT EXISTS idx_conversations_source_conversation_id
  ON conversations(source_conversation_id);

-- NOTE: Quadratic voting tables already exist in this database:
-- - public.quadratic_vote_allocations (proposal_response_id BIGINT -> conversation_responses.id)
-- - public.quadratic_vote_budgets (credits_total/credits_spent per user per conversation)
-- This migration intentionally does NOT create new voting tables.

-- RPC function for atomic quadratic voting with budget enforcement
-- This prevents race conditions by enforcing the 99-credit budget in a single transaction
CREATE OR REPLACE FUNCTION vote_on_proposal(
  p_conversation_id UUID,
  p_response_id BIGINT,
  p_user_id UUID,
  p_delta INTEGER
)
RETURNS TABLE(success BOOLEAN, new_votes INTEGER, remaining_credits INTEGER, error_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
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
  -- Prevent spoofing: callers must vote as themselves
  IF p_user_id IS NULL OR p_user_id != auth.uid() THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'UNAUTHORIZED_USER';
    RETURN;
  END IF;

  -- Validate conversation exists and is a decision session
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

  -- Validate hive membership (SECURITY DEFINER bypasses RLS)
  IF NOT EXISTS (
    SELECT 1
    FROM hive_members
    WHERE hive_id = v_hive_id AND user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'NOT_HIVE_MEMBER';
    RETURN;
  END IF;

  -- Validate response exists and is a proposal
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

  -- Get current votes for this proposal
  SELECT votes INTO v_current_votes
  FROM public.quadratic_vote_allocations
  WHERE conversation_id = p_conversation_id
    AND proposal_response_id = p_response_id
    AND user_id = p_user_id;

  IF v_current_votes IS NULL THEN
    v_current_votes := 0;
  END IF;

  -- Ensure a budget row exists and lock it for update to avoid race conditions
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

  -- Calculate new votes
  v_new_votes := v_current_votes + p_delta;

  -- Votes cannot be negative
  IF v_new_votes < 0 THEN
    RETURN QUERY SELECT FALSE, v_current_votes, 0, 'NEGATIVE_VOTES';
    RETURN;
  END IF;

  -- Calculate current total spend for this user in this conversation
  SELECT COALESCE(SUM(votes * votes), 0) INTO v_current_spend
  FROM public.quadratic_vote_allocations
  WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id;

  -- Calculate cost change for this vote adjustment
  v_new_cost := (v_new_votes * v_new_votes) - (v_current_votes * v_current_votes);

  -- Check budget
  v_total_spend := v_current_spend + v_new_cost;
  IF v_total_spend > v_budget_total THEN
    RETURN QUERY SELECT FALSE, v_current_votes, v_budget_total - v_current_spend, 'BUDGET_EXCEEDED';
    RETURN;
  END IF;

  -- Upsert the vote
  INSERT INTO public.quadratic_vote_allocations (conversation_id, user_id, proposal_response_id, votes, created_at)
  VALUES (p_conversation_id, p_user_id, p_response_id, v_new_votes, now())
  ON CONFLICT (conversation_id, user_id, proposal_response_id)
  DO UPDATE SET votes = EXCLUDED.votes;

  -- Persist updated spend in budgets table (authoritative spend is sum(votes^2))
  UPDATE public.quadratic_vote_budgets
  SET credits_spent = v_total_spend
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

  -- Return success with new state
  RETURN QUERY SELECT TRUE, v_new_votes, v_budget_total - v_total_spend, NULL::TEXT;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION vote_on_proposal(UUID, BIGINT, UUID, INTEGER) TO authenticated;
