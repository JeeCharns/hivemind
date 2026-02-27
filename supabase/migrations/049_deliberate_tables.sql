-- Migration 049: Deliberate Conversation Tables
-- Enables 5-point sentiment voting on statements derived from understand sessions
-- Supports both authenticated users and guests (via share links)

-- ============================================
-- DELIBERATION STATEMENTS (Snapshotted from understand analysis)
-- ============================================

CREATE TABLE IF NOT EXISTS deliberation_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  cluster_index INTEGER,
  cluster_name TEXT,
  statement_text TEXT NOT NULL,
  source_bucket_id UUID REFERENCES conversation_cluster_buckets(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_statement_order UNIQUE (conversation_id, display_order)
);

CREATE INDEX idx_deliberation_statements_conversation
ON deliberation_statements(conversation_id);

-- ============================================
-- DELIBERATION VOTES (1-5 scale sentiment voting)
-- ============================================

CREATE TABLE IF NOT EXISTS deliberation_votes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement_id UUID NOT NULL REFERENCES deliberation_statements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE CASCADE,
  vote_value INTEGER NOT NULL CHECK (vote_value BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each user or guest can vote once per statement
  CONSTRAINT one_vote_per_user UNIQUE (statement_id, user_id),
  CONSTRAINT one_vote_per_guest UNIQUE (statement_id, guest_session_id),
  -- Must have either user_id or guest_session_id
  CONSTRAINT must_have_voter CHECK (user_id IS NOT NULL OR guest_session_id IS NOT NULL)
);

CREATE INDEX idx_deliberation_votes_statement
ON deliberation_votes(statement_id);

CREATE INDEX idx_deliberation_votes_user
ON deliberation_votes(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_deliberation_votes_guest
ON deliberation_votes(guest_session_id) WHERE guest_session_id IS NOT NULL;

-- ============================================
-- DELIBERATION COMMENTS (Optional reasoning)
-- ============================================

CREATE TABLE IF NOT EXISTS deliberation_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement_id UUID NOT NULL REFERENCES deliberation_statements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Must have either user_id or guest_session_id
  CONSTRAINT must_have_commenter CHECK (user_id IS NOT NULL OR guest_session_id IS NOT NULL)
);

CREATE INDEX idx_deliberation_comments_statement
ON deliberation_comments(statement_id);

CREATE INDEX idx_deliberation_comments_user
ON deliberation_comments(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_deliberation_comments_guest
ON deliberation_comments(guest_session_id) WHERE guest_session_id IS NOT NULL;

-- ============================================
-- UPDATE CONVERSATIONS TYPE CHECK
-- ============================================

-- Drop the existing constraint (from migration 048)
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;

-- Add updated constraint with 'deliberate' type
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check
  CHECK (type = ANY (ARRAY['understand'::text, 'explore'::text, 'decide'::text, 'deliberate'::text]));

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE deliberation_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliberation_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliberation_comments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: Statements
-- ============================================

-- Hive members can view statements
CREATE POLICY "Hive members can view deliberation statements"
ON deliberation_statements FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = deliberation_statements.conversation_id
      AND hm.user_id = auth.uid()
  )
);

-- Service role manages statements
CREATE POLICY "Service role manages deliberation statements"
ON deliberation_statements FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- RLS Policies: Votes
-- ============================================

-- Users can view their own votes
CREATE POLICY "Users can view own deliberation votes"
ON deliberation_votes FOR SELECT
USING (user_id = auth.uid());

-- Hive members can view all votes (for aggregates)
CREATE POLICY "Hive members can view deliberation votes"
ON deliberation_votes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deliberation_statements ds
    JOIN conversations c ON c.id = ds.conversation_id
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE ds.id = deliberation_votes.statement_id
      AND hm.user_id = auth.uid()
  )
);

-- Service role manages votes
CREATE POLICY "Service role manages deliberation votes"
ON deliberation_votes FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- RLS Policies: Comments
-- ============================================

-- Hive members can view comments
CREATE POLICY "Hive members can view deliberation comments"
ON deliberation_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deliberation_statements ds
    JOIN conversations c ON c.id = ds.conversation_id
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE ds.id = deliberation_comments.statement_id
      AND hm.user_id = auth.uid()
  )
);

-- Service role manages comments
CREATE POLICY "Service role manages deliberation comments"
ON deliberation_comments FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
