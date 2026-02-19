-- Migration: Enable realtime for conversations table
-- Allows real-time updates on hive homepage when new conversations are created

ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
