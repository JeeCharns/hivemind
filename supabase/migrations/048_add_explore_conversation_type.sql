-- Migration: Add 'explore' conversation type
-- Description: Extends the conversations_type_check constraint to allow 'explore' type

-- Drop the existing constraint
ALTER TABLE conversations DROP CONSTRAINT conversations_type_check;

-- Add updated constraint with 'explore' type
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check
  CHECK (type = ANY (ARRAY['understand'::text, 'explore'::text, 'decide'::text]));
