-- Migration: Enable realtime for conversations table
-- Allows real-time updates on hive homepage when new conversations are created

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
EXCEPTION
  WHEN duplicate_object THEN
    -- Table already in publication, ignore
    NULL;
END $$;
