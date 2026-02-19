-- Migration: Create social feature tables for hive homepage
-- Tables: hive_activity, hive_reactions, user_presence

-- ============================================
-- 1. HIVE ACTIVITY TABLE
-- ============================================
-- Stores activity events: joins, responses, votes, phase changes

CREATE TABLE hive_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('join', 'response', 'vote', 'phase_change')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient hive-scoped queries
CREATE INDEX idx_hive_activity_hive_id_created ON hive_activity(hive_id, created_at DESC);

-- Enable RLS
ALTER TABLE hive_activity ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view activity for their hives
CREATE POLICY "Members can view hive activity"
  ON hive_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hive_activity.hive_id
        AND hive_members.user_id = auth.uid()
    )
  );

-- Policy: Authenticated users can insert activity (server will validate)
CREATE POLICY "Authenticated users can insert activity"
  ON hive_activity
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);


-- ============================================
-- 2. HIVE REACTIONS TABLE
-- ============================================
-- Stores emoji reactions with optional short messages

CREATE TABLE hive_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('👋', '🎉', '💡', '❤️', '🐝')),
  message TEXT CHECK (message IS NULL OR char_length(message) <= 50),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- One reaction per emoji type per user per hive
  UNIQUE(hive_id, user_id, emoji)
);

-- Index for efficient hive-scoped queries
CREATE INDEX idx_hive_reactions_hive_id_created ON hive_reactions(hive_id, created_at DESC);

-- Enable RLS
ALTER TABLE hive_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view reactions for their hives
CREATE POLICY "Members can view hive reactions"
  ON hive_reactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hive_reactions.hive_id
        AND hive_members.user_id = auth.uid()
    )
  );

-- Policy: Members can insert their own reactions
CREATE POLICY "Members can insert own reactions"
  ON hive_reactions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hive_reactions.hive_id
        AND hive_members.user_id = auth.uid()
    )
  );

-- Policy: Users can update their own reactions
CREATE POLICY "Users can update own reactions"
  ON hive_reactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own reactions
CREATE POLICY "Users can delete own reactions"
  ON hive_reactions
  FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================
-- 3. USER PRESENCE TABLE
-- ============================================
-- Tracks last active timestamp per user per hive

CREATE TABLE user_presence (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hive_id UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, hive_id)
);

-- Index for efficient "who's online" queries
CREATE INDEX idx_user_presence_hive_active ON user_presence(hive_id, last_active_at DESC);

-- Enable RLS
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view presence for their hives
CREATE POLICY "Members can view hive presence"
  ON user_presence
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = user_presence.hive_id
        AND hive_members.user_id = auth.uid()
    )
  );

-- Policy: Users can upsert their own presence
CREATE POLICY "Users can upsert own presence"
  ON user_presence
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
  ON user_presence
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================
-- 4. ENABLE REALTIME
-- ============================================
-- Enable realtime for activity and reactions tables

ALTER PUBLICATION supabase_realtime ADD TABLE hive_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE hive_reactions;
