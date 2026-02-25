-- Migration: Update hive_activity event_type constraint
-- Removes unused 'response' and 'vote' types, adds new activity types

-- Remove old constraint
ALTER TABLE hive_activity DROP CONSTRAINT hive_activity_event_type_check;

-- Add new constraint with updated event types
ALTER TABLE hive_activity ADD CONSTRAINT hive_activity_event_type_check
  CHECK (event_type IN (
    'join',
    'conversation_created',
    'analysis_complete',
    'report_generated',
    'round_closed'
  ));
