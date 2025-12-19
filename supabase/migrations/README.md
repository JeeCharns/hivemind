# Database Migrations

This directory contains SQL migration files for the Hivemind database schema.

## Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of the migration file
4. Paste and execute the SQL

## Verifying Migration

After applying the migration, verify the table exists:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'hive_invites';
```

Check RLS policies:

```sql
SELECT * FROM pg_policies WHERE tablename = 'hive_invites';
```

## Rollback

If you need to rollback this migration:

```sql
DROP TABLE IF EXISTS public.hive_invites CASCADE;
DROP FUNCTION IF EXISTS update_hive_invites_updated_at() CASCADE;
```

## Testing the Table

After migration, test with:

```sql
-- Check table structure
\d public.hive_invites

-- Test insert (as an admin user)
INSERT INTO public.hive_invites (hive_id, email, created_by)
VALUES ('your-hive-uuid', 'test@example.com', auth.uid());

-- Verify policies work
SELECT * FROM public.hive_invites;
```
