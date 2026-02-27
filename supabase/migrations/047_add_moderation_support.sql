-- Migration: Add moderation support to conversation_responses
-- Adds moderation fields and audit log table

-- 1. Create moderation flag enum
CREATE TYPE moderation_flag AS ENUM ('antisocial', 'misleading', 'illegal', 'spam', 'doxing');

-- 2. Add moderation columns to conversation_responses
ALTER TABLE conversation_responses
  ADD COLUMN moderation_flag moderation_flag,
  ADD COLUMN moderated_at TIMESTAMPTZ,
  ADD COLUMN moderated_by UUID REFERENCES profiles(id);

-- 3. Create index for filtering non-moderated responses
CREATE INDEX idx_conversation_responses_moderation_flag
  ON conversation_responses (conversation_id)
  WHERE moderation_flag IS NULL;

-- 4. Create moderation audit log table
CREATE TABLE response_moderation_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  response_id BIGINT NOT NULL REFERENCES conversation_responses(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('moderated', 'reinstated')),
  flag moderation_flag NOT NULL,
  performed_by UUID NOT NULL REFERENCES profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create index for fetching moderation history by conversation
CREATE INDEX idx_response_moderation_log_response_id ON response_moderation_log(response_id);

-- 6. Enable RLS on moderation log
ALTER TABLE response_moderation_log ENABLE ROW LEVEL SECURITY;

-- 7. RLS policy: Anyone can read moderation logs (per design requirement)
CREATE POLICY "response_moderation_log_select" ON response_moderation_log
  FOR SELECT USING (true);

-- 8. RLS policy: Only admins can insert (enforced at API level, but defense in depth)
-- Note: Actual admin check happens in API; this just requires authenticated user
CREATE POLICY "response_moderation_log_insert" ON response_moderation_log
  FOR INSERT WITH CHECK (auth.uid() = performed_by);
