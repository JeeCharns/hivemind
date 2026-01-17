-- Revert overly-permissive policy added in 008_allow_public_invite_preview.sql.
-- Invite preview should be served via a server-side endpoint using the service role,
-- not by allowing anonymous clients to read all rows from hive_invite_links.

DROP POLICY IF EXISTS "Anyone can view invite link by token"
  ON public.hive_invite_links;
