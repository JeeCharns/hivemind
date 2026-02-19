-- Migration: Add is_system_hive column to hives table
-- System hives (like Welcome Hive) cannot be deleted and have special behaviour

ALTER TABLE hives ADD COLUMN IF NOT EXISTS is_system_hive BOOLEAN DEFAULT false;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_hives_is_system_hive ON hives(is_system_hive) WHERE is_system_hive = true;

-- Prevent deletion of system hives
CREATE OR REPLACE FUNCTION prevent_system_hive_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system_hive = true THEN
    RAISE EXCEPTION 'Cannot delete system hive';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_prevent_system_hive_deletion
  BEFORE DELETE ON hives
  FOR EACH ROW
  EXECUTE FUNCTION prevent_system_hive_deletion();
