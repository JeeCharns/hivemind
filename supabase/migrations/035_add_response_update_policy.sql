-- Allow users to update their own responses
-- This enables the edit functionality in the Listen tab

CREATE POLICY "conversation_responses_update_own" ON public.conversation_responses
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
