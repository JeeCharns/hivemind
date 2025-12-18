-- Add avatar_path column to profiles table if it doesn't exist
-- This supports the profile setup onboarding flow

-- Add avatar_path column (nullable, stores path to avatar in storage)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_path TEXT;

-- Create avatars storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for avatars bucket
-- Allow authenticated users to upload their own avatar
CREATE POLICY IF NOT EXISTS "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own avatar
CREATE POLICY IF NOT EXISTS "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own avatar
CREATE POLICY IF NOT EXISTS "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to avatars (since bucket is public)
CREATE POLICY IF NOT EXISTS "Public avatars are readable by anyone"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');
