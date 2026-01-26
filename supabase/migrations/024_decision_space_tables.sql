-- Migration 024: Decision Space Tables
-- Enables versioned voting rounds on snapshotted statements from understand sessions

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE decision_round_status AS ENUM ('voting_open', 'voting_closed', 'results_generated');
CREATE TYPE decision_visibility AS ENUM ('hidden', 'aggregate', 'transparent');

-- ============================================
-- DECISION PROPOSALS (Snapshotted statements)
-- ============================================

CREATE TABLE IF NOT EXISTS decision_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_bucket_id UUID REFERENCES conversation_cluster_buckets(id) ON DELETE SET NULL,
  source_cluster_index INTEGER NOT NULL,
  statement_text TEXT NOT NULL,
  original_agree_percent DECIMAL(5,2),
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_proposal_order UNIQUE (conversation_id, display_order)
);

CREATE INDEX idx_decision_proposals_conversation
ON decision_proposals(conversation_id);

-- ============================================
-- DECISION ROUNDS (Versioned voting periods)
-- ============================================

CREATE TABLE IF NOT EXISTS decision_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1,
  status decision_round_status NOT NULL DEFAULT 'voting_open',
  visibility decision_visibility NOT NULL DEFAULT 'hidden',
  deadline TIMESTAMPTZ,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,

  CONSTRAINT unique_round_number UNIQUE (conversation_id, round_number),
  CONSTRAINT valid_round_number CHECK (round_number > 0)
);

CREATE INDEX idx_decision_rounds_conversation
ON decision_rounds(conversation_id);

CREATE INDEX idx_decision_rounds_status
ON decision_rounds(status) WHERE status = 'voting_open';

-- ============================================
-- DECISION VOTES (Per-round quadratic votes)
-- ============================================

CREATE TABLE IF NOT EXISTS decision_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES decision_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  proposal_id UUID NOT NULL REFERENCES decision_proposals(id) ON DELETE CASCADE,
  votes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_vote_per_user_proposal UNIQUE (round_id, user_id, proposal_id),
  CONSTRAINT non_negative_votes CHECK (votes >= 0)
);

CREATE INDEX idx_decision_votes_user_round
ON decision_votes(round_id, user_id);

-- ============================================
-- DECISION RESULTS (Generated per round)
-- ============================================

CREATE TABLE IF NOT EXISTS decision_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES decision_rounds(id) ON DELETE CASCADE,
  proposal_rankings JSONB NOT NULL DEFAULT '[]',
  ai_analysis TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_result_per_round UNIQUE (round_id)
);

-- ============================================
-- RPC: Vote on proposal with budget enforcement
-- ============================================

CREATE OR REPLACE FUNCTION vote_on_decision_proposal(
  p_round_id UUID,
  p_proposal_id UUID,
  p_user_id UUID,
  p_delta INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
  -- Get round info
  SELECT dr.conversation_id, dr.status, c.hive_id
  INTO v_conversation_id, v_round_status, v_hive_id
  FROM decision_rounds dr
  JOIN conversations c ON c.id = dr.conversation_id
  WHERE dr.id = p_round_id;

  IF v_conversation_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ROUND_NOT_FOUND');
  END IF;

  -- Check round is open
  IF v_round_status != 'voting_open' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ROUND_CLOSED');
  END IF;

  -- Check hive membership
  IF NOT EXISTS (
    SELECT 1 FROM hive_members
    WHERE hive_id = v_hive_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_HIVE_MEMBER');
  END IF;

  -- Check proposal belongs to this conversation
  IF NOT EXISTS (
    SELECT 1 FROM decision_proposals
    WHERE id = p_proposal_id AND conversation_id = v_conversation_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PROPOSAL');
  END IF;

  -- Get current votes for this proposal
  SELECT COALESCE(votes, 0) INTO v_current_votes
  FROM decision_votes
  WHERE round_id = p_round_id
    AND user_id = p_user_id
    AND proposal_id = p_proposal_id;

  IF v_current_votes IS NULL THEN
    v_current_votes := 0;
  END IF;

  v_new_votes := v_current_votes + p_delta;

  -- Check no negative votes
  IF v_new_votes < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NEGATIVE_VOTES');
  END IF;

  -- Calculate costs (quadratic)
  v_current_cost := v_current_votes * v_current_votes;
  v_new_cost := v_new_votes * v_new_votes;

  -- Calculate total spent (excluding this proposal)
  SELECT COALESCE(SUM(votes * votes), 0) INTO v_total_spent
  FROM decision_votes
  WHERE round_id = p_round_id
    AND user_id = p_user_id
    AND proposal_id != p_proposal_id;

  -- Check budget
  IF (v_total_spent + v_new_cost) > v_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BUDGET_EXCEEDED',
      'remaining_credits', v_budget - v_total_spent
    );
  END IF;

  -- Upsert vote
  INSERT INTO decision_votes (round_id, user_id, proposal_id, votes, updated_at)
  VALUES (p_round_id, p_user_id, p_proposal_id, v_new_votes, NOW())
  ON CONFLICT (round_id, user_id, proposal_id)
  DO UPDATE SET votes = v_new_votes, updated_at = NOW();

  -- Delete if zero votes
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION vote_on_decision_proposal(UUID, UUID, UUID, INTEGER) TO authenticated;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE decision_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_results ENABLE ROW LEVEL SECURITY;

-- Proposals: viewable by hive members
CREATE POLICY "Hive members can view proposals"
ON decision_proposals FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = decision_proposals.conversation_id
      AND hm.user_id = auth.uid()
  )
);

-- Rounds: viewable by hive members
CREATE POLICY "Hive members can view rounds"
ON decision_rounds FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = decision_rounds.conversation_id
      AND hm.user_id = auth.uid()
  )
);

-- Votes: viewable based on round visibility
CREATE POLICY "Users can view own votes"
ON decision_votes FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Transparent rounds show all votes"
ON decision_votes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM decision_rounds dr
    JOIN conversations c ON c.id = dr.conversation_id
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE dr.id = decision_votes.round_id
      AND dr.visibility = 'transparent'
      AND hm.user_id = auth.uid()
  )
);

-- Results: viewable by hive members after generation
CREATE POLICY "Hive members can view results"
ON decision_results FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM decision_rounds dr
    JOIN conversations c ON c.id = dr.conversation_id
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE dr.id = decision_results.round_id
      AND hm.user_id = auth.uid()
  )
);

-- Service role policies for all tables
CREATE POLICY "Service role manages proposals"
ON decision_proposals FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages rounds"
ON decision_rounds FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages votes"
ON decision_votes FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages results"
ON decision_results FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
