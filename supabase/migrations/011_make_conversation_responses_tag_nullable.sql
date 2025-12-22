-- Migration: Make tag column nullable in conversation_responses table
-- Purpose: Allow responses without tags (optional tagging)
-- Date: 2025-12-19

-- Make the tag column nullable
ALTER TABLE public.conversation_responses
  ALTER COLUMN tag DROP NOT NULL;

-- Verify the change
COMMENT ON COLUMN public.conversation_responses.tag IS 'Optional tag for categorizing responses (question, idea, concern, blocker, proposal)';
