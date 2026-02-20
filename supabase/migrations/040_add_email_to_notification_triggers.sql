-- Migration: Add pg_net email sending to notification triggers
-- Requires: pg_net extension enabled, vault secrets 'app_url' and 'internal_api_key'
--
-- Email notifications are sent for:
--   - new_conversation (if user has new_conversation email preference enabled)
--   - analysis_complete (if user has conversation_progress email preference enabled)
--   - report_generated (if user has conversation_progress email preference enabled)
--   - opinion_liked: NO EMAIL (in-app only per design spec)
--
-- The email preference check happens in the API endpoint, not here.
-- This keeps triggers simple and allows preference changes without trigger updates.

-- ============================================
-- 1. ENSURE PG_NET EXTENSION IS ENABLED
-- ============================================
-- Note: This must also be enabled in Supabase Dashboard > Database > Extensions

CREATE EXTENSION IF NOT EXISTS pg_net;


-- ============================================
-- 2. HELPER FUNCTION FOR SENDING NOTIFICATION EMAILS
-- ============================================
-- Centralizes the pg_net call logic to avoid repetition in triggers

CREATE OR REPLACE FUNCTION send_notification_email(
  p_notification_id UUID,
  p_user_id UUID
)
RETURNS void AS $$
DECLARE
  v_app_url TEXT;
  v_api_key TEXT;
BEGIN
  -- Get config from vault
  SELECT decrypted_secret INTO v_app_url
  FROM vault.decrypted_secrets WHERE name = 'app_url';

  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets WHERE name = 'internal_api_key';

  -- Skip if vault secrets not configured
  IF v_app_url IS NULL OR v_api_key IS NULL THEN
    RAISE WARNING '[send_notification_email] Vault secrets not configured, skipping email';
    RETURN;
  END IF;

  -- Send async HTTP request via pg_net
  PERFORM net.http_post(
    url := v_app_url || '/api/notifications/email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_api_key
    ),
    body := jsonb_build_object(
      'notification_id', p_notification_id,
      'user_id', p_user_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


-- ============================================
-- 3. UPDATE NEW CONVERSATION TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION notify_new_conversation()
RETURNS TRIGGER AS $$
DECLARE
  v_notification RECORD;
BEGIN
  -- Insert notifications and send emails for each hive member (except creator)
  FOR v_notification IN
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
      AND m.user_id != NEW.created_by
    RETURNING id, user_id
  LOOP
    PERFORM send_notification_email(v_notification.id, v_notification.user_id);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


-- ============================================
-- 4. UPDATE ANALYSIS COMPLETE TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION notify_analysis_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_notification RECORD;
BEGIN
  -- Only trigger when analysis_status changes to 'ready'
  IF NEW.analysis_status = 'ready' AND (OLD.analysis_status IS NULL OR OLD.analysis_status != 'ready') THEN
    FOR v_notification IN
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
      WHERE h.id = NEW.hive_id
      RETURNING id, user_id
    LOOP
      PERFORM send_notification_email(v_notification.id, v_notification.user_id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


-- ============================================
-- 5. UPDATE REPORT GENERATED TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION notify_report_generated()
RETURNS TRIGGER AS $$
DECLARE
  v_conversation RECORD;
  v_notification RECORD;
BEGIN
  -- Get conversation details
  SELECT c.id, c.title, c.hive_id, h.slug, h.name as hive_name
  INTO v_conversation
  FROM conversations c
  JOIN hives h ON h.id = c.hive_id
  WHERE c.id = NEW.conversation_id;

  IF v_conversation IS NOT NULL THEN
    FOR v_notification IN
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
      WHERE m.hive_id = v_conversation.hive_id
      RETURNING id, user_id
    LOOP
      PERFORM send_notification_email(v_notification.id, v_notification.user_id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


-- ============================================
-- 6. OPINION LIKED TRIGGER - NO CHANGES
-- ============================================
-- Per design spec, opinion_liked notifications are in-app only (no email).
-- The existing trigger from migration 039 remains unchanged.
