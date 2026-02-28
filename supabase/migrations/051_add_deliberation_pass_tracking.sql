-- Migration: Add pass tracking to deliberation votes
-- Allows tracking when users explicitly pass on a statement

-- Add is_pass column to track pass interactions
ALTER TABLE deliberation_votes
  ADD COLUMN is_pass BOOLEAN NOT NULL DEFAULT FALSE;

-- Allow vote_value to be NULL when is_pass is TRUE
ALTER TABLE deliberation_votes
  DROP CONSTRAINT IF EXISTS deliberation_votes_vote_value_check;

ALTER TABLE deliberation_votes
  ADD CONSTRAINT deliberation_votes_vote_value_check
  CHECK (
    (is_pass = TRUE AND vote_value IS NULL) OR
    (is_pass = FALSE AND vote_value BETWEEN 1 AND 5)
  );

-- Make vote_value nullable (required for pass)
ALTER TABLE deliberation_votes
  ALTER COLUMN vote_value DROP NOT NULL;

-- Create index for finding passes
CREATE INDEX idx_deliberation_votes_passes
ON deliberation_votes(statement_id, is_pass) WHERE is_pass = TRUE;
