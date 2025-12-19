# Supabase (Schema + Migrations)

## Migrations

Apply migrations whenever you pull schema-related changes or when setting up a new environment.

### Option 1: Supabase CLI (recommended)

```bash
supabase db push
```

### Option 2: Manual (Supabase Dashboard)

Supabase Dashboard → SQL Editor, run these in order:

1. `supabase/migrations/001_create_hive_invites.sql`
2. `supabase/migrations/002_create_conversation_analysis_jobs.sql`
3. `supabase/migrations/003_add_analysis_fields.sql`
4. `supabase/migrations/004_enhance_analysis_fields.sql`
5. `supabase/migrations/005_add_profile_avatar.sql`
6. `supabase/migrations/006_add_solution_space_fields.sql`
7. `supabase/migrations/007_create_hive_invite_links.sql`
8. `supabase/migrations/008_allow_public_invite_preview.sql`
9. `supabase/migrations/009_remove_public_invite_preview_policy.sql`

## What These Migrations Enable

- Async conversation analysis queue via `conversation_analysis_jobs`
- CSV import idempotency via `conversation_responses.import_batch_id`
- Analysis status/error fields on `conversations` (`analysis_status`, `analysis_error`)
- Theme + clustering results (`conversation_themes`, response `x/y/cluster_index`)
- Hive invite links via `hive_invite_links` (token-based join links)
- Profile avatars via `profiles.avatar_path`

## Notes

- `008_allow_public_invite_preview.sql` was an interim migration that made invite links publicly readable; `009_remove_public_invite_preview_policy.sql` removes that policy. Invite preview is served via `GET /api/invites/[token]/preview` using the service role (server-side).
