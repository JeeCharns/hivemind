-- ============================================
-- 025: Add missing foreign key indexes
-- ============================================
-- Foreign keys without covering indexes cause sequential scans
-- when the referenced row is updated or deleted. Adding these
-- indexes keeps DELETE/UPDATE on parent tables fast.
-- ============================================

CREATE INDEX IF NOT EXISTS idx_conversation_analysis_jobs_created_by
  ON conversation_analysis_jobs(created_by);

CREATE INDEX IF NOT EXISTS idx_conversation_attachments_uploaded_by
  ON conversation_attachments(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_conversation_reports_created_by
  ON conversation_reports(created_by);

CREATE INDEX IF NOT EXISTS idx_conversation_unconsolidated_responses_response_id
  ON conversation_unconsolidated_responses(response_id);

CREATE INDEX IF NOT EXISTS idx_conversations_created_by
  ON conversations(created_by);

CREATE INDEX IF NOT EXISTS idx_decision_proposals_source_bucket_id
  ON decision_proposals(source_bucket_id);

CREATE INDEX IF NOT EXISTS idx_decision_votes_proposal_id
  ON decision_votes(proposal_id);

CREATE INDEX IF NOT EXISTS idx_hive_invite_links_created_by
  ON hive_invite_links(created_by);

CREATE INDEX IF NOT EXISTS idx_hive_invites_created_by
  ON hive_invites(created_by);

CREATE INDEX IF NOT EXISTS idx_hive_members_user_id
  ON hive_members(user_id);

CREATE INDEX IF NOT EXISTS idx_quadratic_vote_allocations_user_id
  ON quadratic_vote_allocations(user_id);

CREATE INDEX IF NOT EXISTS idx_quadratic_vote_budgets_user_id
  ON quadratic_vote_budgets(user_id);

CREATE INDEX IF NOT EXISTS idx_response_feedback_user_id
  ON response_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_response_likes_user_id
  ON response_likes(user_id);
