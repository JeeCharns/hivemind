# Setup (Local + Services)

## Environment

- Copy `.env.example` to `.env.local` and fill in required keys.
- Node version is pinned in `.nvmrc` (matches CI).
- Supabase env var naming:
  - Browser/client: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - Server/scripts: `SUPABASE_SECRET_KEY` (service role key)

## Database

- Apply migrations: `supabase/README.md`

## Connection Pooling (Required for Production)

Supabase uses PgBouncer for connection pooling. **This is required for handling 100+ concurrent users.**

### Setup

1. Go to Supabase Dashboard → Project Settings → Database
2. Find "Connection Pooling" section
3. Copy the **Pooled connection string** (port 6543, not 5432)
4. Set `DATABASE_URL` in your environment to the pooled string:
   ```
   DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

### Capacity by Plan

| Plan | Direct Connections | Pooled Connections |
|------|-------------------|-------------------|
| Free | 15 | 50 |
| Pro | 60 | 200 |
| Team | 120 | 400 |

For 200+ concurrent users, **Pro plan or higher is required**.

### Verification

Check active connections in Supabase Dashboard → Database → Database Health.
If you see connection errors in logs, verify pooling is enabled.

## Welcome Hive Seed

After applying migrations, seed the Welcome Hive (system hive that new users auto-join):

```bash
npx tsx scripts/seed-welcome-hive.ts
```

This creates (or updates) the Welcome Hive with sample conversations. Run once per environment.

## Analysis Worker

- Worker docs + commands: `scripts/README.md`
