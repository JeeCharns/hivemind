-- Allow any hive member to create an invite link (not just admins)
-- Previously only admins could INSERT into hive_invite_links, which blocked
-- non-admin members from accessing the share/invite page when no link existed.

-- Add INSERT policy for members (SELECT already exists via "Members can view hive invite links")
CREATE POLICY "Members can create hive invite links"
  ON public.hive_invite_links
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hive_members
      WHERE hive_members.hive_id = hive_invite_links.hive_id
        AND hive_members.user_id = auth.uid()
    )
  );
