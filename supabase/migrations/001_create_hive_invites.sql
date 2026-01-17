-- Create hive_invites table for managing hive invitation system
-- This table stores pending and accepted invitations to hives

CREATE TABLE IF NOT EXISTS public.hive_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id UUID NOT NULL REFERENCES public.hives(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,

  -- Prevent duplicate pending invites for the same email+hive
  UNIQUE(hive_id, email, status)
);

-- Index for faster lookups by hive
CREATE INDEX IF NOT EXISTS idx_hive_invites_hive_id ON public.hive_invites(hive_id);

-- Index for faster lookups by email
CREATE INDEX IF NOT EXISTS idx_hive_invites_email ON public.hive_invites(email);

-- Index for faster lookups by status
CREATE INDEX IF NOT EXISTS idx_hive_invites_status ON public.hive_invites(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_hive_invites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_hive_invites_updated_at
  BEFORE UPDATE ON public.hive_invites
  FOR EACH ROW
  EXECUTE FUNCTION update_hive_invites_updated_at();

-- Enable Row Level Security
ALTER TABLE public.hive_invites ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all invites for their hives
CREATE POLICY "Admins can view hive invites"
  ON public.hive_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invites.hive_id
        AND hive_members.user_id = auth.uid()
        AND hive_members.role = 'admin'
    )
  );

-- Policy: Admins can insert invites for their hives
CREATE POLICY "Admins can create hive invites"
  ON public.hive_invites
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invites.hive_id
        AND hive_members.user_id = auth.uid()
        AND hive_members.role = 'admin'
    )
  );

-- Policy: Admins can delete invites for their hives
CREATE POLICY "Admins can delete hive invites"
  ON public.hive_invites
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invites.hive_id
        AND hive_members.user_id = auth.uid()
        AND hive_members.role = 'admin'
    )
  );

-- Policy: Admins can update invites for their hives
CREATE POLICY "Admins can update hive invites"
  ON public.hive_invites
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invites.hive_id
        AND hive_members.user_id = auth.uid()
        AND hive_members.role = 'admin'
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hive_invites TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

COMMENT ON TABLE public.hive_invites IS 'Stores pending and accepted invitations to hives';
COMMENT ON COLUMN public.hive_invites.id IS 'Unique identifier for the invite';
COMMENT ON COLUMN public.hive_invites.hive_id IS 'The hive this invite is for';
COMMENT ON COLUMN public.hive_invites.email IS 'Email address of the invited user';
COMMENT ON COLUMN public.hive_invites.status IS 'Status of the invite: pending, accepted, or revoked';
COMMENT ON COLUMN public.hive_invites.created_by IS 'User ID of the admin who created this invite';
COMMENT ON COLUMN public.hive_invites.accepted_at IS 'Timestamp when the invite was accepted';
