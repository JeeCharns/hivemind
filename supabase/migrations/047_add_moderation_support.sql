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

-- 4. Create FK index for moderated_by
CREATE INDEX idx_conversation_responses_moderated_by
  ON conversation_responses (moderated_by)
  WHERE moderated_by IS NOT NULL;

-- 5. Create moderation audit log table
CREATE TABLE response_moderation_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  response_id BIGINT NOT NULL REFERENCES conversation_responses(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('moderated', 'reinstated')),
  flag moderation_flag NOT NULL,
  performed_by UUID NOT NULL REFERENCES profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Create index for fetching moderation history by response
CREATE INDEX idx_response_moderation_log_response_id ON response_moderation_log(response_id);

-- 7. Create FK index for performed_by
CREATE INDEX idx_response_moderation_log_performed_by ON response_moderation_log(performed_by);

-- 8. Enable RLS on moderation log
ALTER TABLE response_moderation_log ENABLE ROW LEVEL SECURITY;

-- 9. RLS policy: Anyone can read moderation logs (per design requirement)
CREATE POLICY "response_moderation_log_select" ON response_moderation_log
  FOR SELECT USING (true);

-- 10. RLS policy: Authenticated users can insert (admin check enforced at API level)
-- RLS ensures performed_by matches the authenticated user; API enforces admin role
CREATE POLICY "response_moderation_log_insert" ON response_moderation_log
  FOR INSERT WITH CHECK (auth.uid() = performed_by);
