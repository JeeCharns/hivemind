-- Create hive_invite_links table for managing shareable hive join links
-- Separate from hive_invites which requires email NOT NULL and represents per-email invitations

CREATE TABLE IF NOT EXISTS public.hive_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id UUID NOT NULL REFERENCES public.hives(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  access_mode TEXT NOT NULL DEFAULT 'anyone' CHECK (access_mode IN ('anyone', 'invited_only')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One active link per hive for simplicity
  UNIQUE(hive_id)
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_hive_invite_links_token ON public.hive_invite_links(token);

-- Index for hive lookups
CREATE INDEX IF NOT EXISTS idx_hive_invite_links_hive_id ON public.hive_invite_links(hive_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_hive_invite_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_hive_invite_links_updated_at
  BEFORE UPDATE ON public.hive_invite_links
  FOR EACH ROW
  EXECUTE FUNCTION update_hive_invite_links_updated_at();

-- Enable Row Level Security
ALTER TABLE public.hive_invite_links ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view the invite link for their hive
CREATE POLICY "Members can view hive invite links"
  ON public.hive_invite_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = auth.uid()
    )
  );

-- Policy: Admins can create/update invite links for their hives
CREATE POLICY "Admins can manage hive invite links"
  ON public.hive_invite_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = auth.uid()
        AND hive_members.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = auth.uid()
        AND hive_members.role = 'admin'
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hive_invite_links TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

COMMENT ON TABLE public.hive_invite_links IS 'Stores shareable invite links for hives with configurable access modes';
COMMENT ON COLUMN public.hive_invite_links.id IS 'Unique identifier for the invite link';
COMMENT ON COLUMN public.hive_invite_links.hive_id IS 'The hive this invite link is for';
COMMENT ON COLUMN public.hive_invite_links.token IS 'Cryptographically strong random token used in the invite URL';
COMMENT ON COLUMN public.hive_invite_links.access_mode IS 'Access mode: anyone (any user with link can join) or invited_only (only invited emails can join)';
COMMENT ON COLUMN public.hive_invite_links.created_by IS 'User ID of the admin who created this link';
