-- Migration: Create notification system tables and triggers
-- Tables: user_notifications
-- Triggers: new_conversation, analysis_complete, report_generated, opinion_liked

-- ============================================
-- 1. USER NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_conversation', 'analysis_complete', 'report_generated', 'opinion_liked')),
  title TEXT NOT NULL,
  body TEXT,

  -- Polymorphic reference to source
  hive_id UUID REFERENCES hives(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  response_id BIGINT REFERENCES conversation_responses(id) ON DELETE SET NULL,

  -- For deep linking with anchor
  link_path TEXT NOT NULL,

  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching user's unread notifications
CREATE INDEX idx_user_notifications_user_unread
  ON user_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Index for 90-day cleanup job
CREATE INDEX idx_user_notifications_cleanup
  ON user_notifications(created_at)
  WHERE created_at < now() - INTERVAL '90 days';

-- Enable RLS
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON user_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON user_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON user_notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Service role has full access (for triggers)
CREATE POLICY "Service role has full access to user_notifications"
  ON user_notifications
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;


-- ============================================
-- 2. ADD EMAIL_PREFERENCES TO PROFILES
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  email_preferences JSONB DEFAULT '{"new_conversation": true, "conversation_progress": true}'::jsonb;


-- ============================================
-- 3. NOTIFICATION TRIGGERS
-- ============================================

-- 3a. New Conversation Trigger
CREATE OR REPLACE FUNCTION notify_new_conversation()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notification for all hive members except the creator
  INSERT INTO user_notifications (user_id, type, title, body, hive_id, conversation_id, link_path)
  SELECT
    m.user_id,
    'new_conversation',
    'New conversation in ' || h.name,
    NEW.title,
    NEW.hive_id,
    NEW.id,
    '/hives/' || COALESCE(h.slug, h.id::text) || '/conversations/' || NEW.id
  FROM hive_members m
  JOIN hives h ON h.id = NEW.hive_id
  WHERE m.hive_id = NEW.hive_id
    AND m.user_id != NEW.created_by;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_new_conversation
  AFTER INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION notify_new_conversation();


-- 3b. Analysis Complete Trigger
CREATE OR REPLACE FUNCTION notify_analysis_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when analysis_status changes to 'ready'
  IF NEW.analysis_status = 'ready' AND (OLD.analysis_status IS NULL OR OLD.analysis_status != 'ready') THEN
    INSERT INTO user_notifications (user_id, type, title, body, hive_id, conversation_id, link_path)
    SELECT
      m.user_id,
      'analysis_complete',
      'Analysis complete',
      NEW.title,
      NEW.hive_id,
      NEW.id,
      '/hives/' || COALESCE(h.slug, h.id::text) || '/conversations/' || NEW.id || '#analysis'
    FROM hives h
    JOIN hive_members m ON m.hive_id = h.id
    WHERE h.id = NEW.hive_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_analysis_complete
  AFTER UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION notify_analysis_complete();


-- 3c. Report Generated Trigger
CREATE OR REPLACE FUNCTION notify_report_generated()
RETURNS TRIGGER AS $$
DECLARE
  v_conversation RECORD;
BEGIN
  -- Get conversation details
  SELECT c.id, c.title, c.hive_id, h.slug, h.name as hive_name
  INTO v_conversation
  FROM conversations c
  JOIN hives h ON h.id = c.hive_id
  WHERE c.id = NEW.conversation_id;

  IF v_conversation IS NOT NULL THEN
    INSERT INTO user_notifications (user_id, type, title, body, hive_id, conversation_id, link_path)
    SELECT
      m.user_id,
      'report_generated',
      'New report available',
      v_conversation.title,
      v_conversation.hive_id,
      v_conversation.id,
      '/hives/' || COALESCE(v_conversation.slug, v_conversation.hive_id::text) || '/conversations/' || v_conversation.id || '#report'
    FROM hive_members m
    WHERE m.hive_id = v_conversation.hive_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_report_generated
  AFTER INSERT ON conversation_reports
  FOR EACH ROW EXECUTE FUNCTION notify_report_generated();


-- 3d. Opinion Liked Trigger
CREATE OR REPLACE FUNCTION notify_opinion_liked()
RETURNS TRIGGER AS $$
DECLARE
  v_response RECORD;
BEGIN
  -- Get response and conversation details
  SELECT
    r.id as response_id,
    r.user_id as author_id,
    LEFT(r.response_text, 100) as response_preview,
    c.id as conversation_id,
    c.title as conversation_title,
    c.hive_id,
    h.slug
  INTO v_response
  FROM conversation_responses r
  JOIN conversations c ON c.id = r.conversation_id
  JOIN hives h ON h.id = c.hive_id
  WHERE r.id = NEW.response_id;

  -- Only notify if the liker is not the author
  IF v_response IS NOT NULL AND v_response.author_id != NEW.user_id THEN
    INSERT INTO user_notifications (user_id, type, title, body, hive_id, conversation_id, response_id, link_path)
    VALUES (
      v_response.author_id,
      'opinion_liked',
      'Someone liked your opinion',
      v_response.response_preview,
      v_response.hive_id,
      v_response.conversation_id,
      v_response.response_id,
      '/hives/' || COALESCE(v_response.slug, v_response.hive_id::text) || '/conversations/' || v_response.conversation_id || '#response-' || v_response.response_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_opinion_liked
  AFTER INSERT ON response_likes
  FOR EACH ROW EXECUTE FUNCTION notify_opinion_liked();
