# Database Migrations

This directory contains SQL migration files for the Hivemind database schema.

## Migration Files

### 001_create_hive_invites.sql
Creates the `hive_invites` table for managing hive invitation system.

**Features:**
- Stores pending, accepted, and revoked invitations
- Links invites to hives and tracks who created them
- Prevents duplicate pending invites for same email+hive
- Includes RLS policies for admin-only access
- Auto-updates `updated_at` timestamp
- Indexed for performance

**Schema:**
```sql
hive_invites (
  id UUID PRIMARY KEY,
  hive_id UUID REFERENCES hives(id),
  email TEXT NOT NULL,
  status TEXT ('pending' | 'accepted' | 'revoked'),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ
)
```

## How to Apply Migrations

### Option 1: Using Supabase CLI (Recommended)

1. Install Supabase CLI if you haven't:
```bash
npm install -g supabase
```

2. Link to your Supabase project:
```bash
supabase link --project-ref your-project-ref
```

3. Apply migrations:
```bash
supabase db push
```

### Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of the migration file
4. Paste and execute the SQL

### Option 3: Direct PostgreSQL Connection

If you have direct database access:

```bash
psql postgresql://your-connection-string -f supabase/migrations/001_create_hive_invites.sql
```

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
