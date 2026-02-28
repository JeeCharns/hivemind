-- Migration: Add moderation and edit support to deliberation_comments
-- Adds moderation fields and updated_at for edit tracking

-- 1. Add moderation columns to deliberation_comments
ALTER TABLE deliberation_comments
  ADD COLUMN moderation_flag moderation_flag,
  ADD COLUMN moderated_at TIMESTAMPTZ,
  ADD COLUMN moderated_by UUID REFERENCES profiles(id),
  ADD COLUMN updated_at TIMESTAMPTZ;

-- 2. Create index for filtering non-moderated comments
CREATE INDEX idx_deliberation_comments_moderation_flag
  ON deliberation_comments (statement_id)
  WHERE moderation_flag IS NULL;

-- 3. Create FK index for moderated_by
CREATE INDEX idx_deliberation_comments_moderated_by
  ON deliberation_comments (moderated_by)
  WHERE moderated_by IS NOT NULL;

-- 4. Create moderation audit log table for comments
CREATE TABLE deliberation_comment_moderation_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comment_id BIGINT NOT NULL REFERENCES deliberation_comments(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('moderated', 'reinstated')),
  flag moderation_flag NOT NULL,
  performed_by UUID NOT NULL REFERENCES profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create index for fetching moderation history by comment
CREATE INDEX idx_deliberation_comment_moderation_log_comment_id
  ON deliberation_comment_moderation_log(comment_id);

-- 6. Create FK index for performed_by
CREATE INDEX idx_deliberation_comment_moderation_log_performed_by
  ON deliberation_comment_moderation_log(performed_by);

-- 7. Enable RLS on moderation log
ALTER TABLE deliberation_comment_moderation_log ENABLE ROW LEVEL SECURITY;

-- 8. RLS policy: Anyone can read moderation logs
CREATE POLICY "deliberation_comment_moderation_log_select"
  ON deliberation_comment_moderation_log
  FOR SELECT USING (true);

-- 9. RLS policy: Authenticated users can insert (admin check enforced at API level)
CREATE POLICY "deliberation_comment_moderation_log_insert"
  ON deliberation_comment_moderation_log
  FOR INSERT WITH CHECK (auth.uid() = performed_by);
