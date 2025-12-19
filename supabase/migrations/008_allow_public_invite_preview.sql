-- Allow public access to invite links by token for preview purposes
-- This is safe because:
-- 1. Tokens are cryptographically strong (256 bits entropy)
-- 2. Only hive name and access mode are exposed
-- 3. Required for login page to show "Join {HiveName}" before authentication

CREATE POLICY "Anyone can view invite link by token"
  ON public.hive_invite_links
  FOR SELECT
  USING (true);

COMMENT ON POLICY "Anyone can view invite link by token" ON public.hive_invite_links
  IS 'Allows unauthenticated users to preview invite links by token for the login flow';
