# Supabase (Schema + Migrations)

## Migrations

Apply migrations whenever you pull schema-related changes or when setting up a new environment.

### Option 1: Supabase CLI (recommended)

```bash
supabase db push
```

### Option 2: Manual (Supabase Dashboard)

Supabase Dashboard → SQL Editor, run these in order:

1. `supabase/migrations/002_create_conversation_analysis_jobs.sql`
2. `supabase/migrations/003_add_analysis_fields.sql`

## What These Migrations Enable

- Async conversation analysis queue via `conversation_analysis_jobs`
- CSV import idempotency via `conversation_responses.import_batch_id`
- Analysis status/error fields on `conversations` (`analysis_status`, `analysis_error`)
- Theme + clustering results (`conversation_themes`, response `x/y/cluster_index`)

