-- Migration: Add visibility column to hives
-- Allows hives to be public (searchable, joinable) or private (invite-only)

-- Add visibility column with default 'public' for backward compatibility
ALTER TABLE hives ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

-- Add check constraint for valid visibility values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hives_visibility_check'
  ) THEN
    ALTER TABLE hives ADD CONSTRAINT hives_visibility_check
      CHECK (visibility IN ('public', 'private'));
  END IF;
END $$;

-- Create index for efficient public hive queries (search/join filtering)
CREATE INDEX IF NOT EXISTS idx_hives_visibility ON hives(visibility);
