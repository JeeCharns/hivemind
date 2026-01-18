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
10. `supabase/migrations/018_add_hive_visibility.sql`
11. `supabase/migrations/021_add_feedback_count_function.sql` (feedback count aggregation)
12. `supabase/migrations/022_add_vote_composite_index.sql` (vote budget query optimization)
13. `supabase/migrations/023_allow_members_to_create_invite_links.sql` (fix: allow non-admin members to create invite links)

## What These Migrations Enable

- Async conversation analysis queue via `conversation_analysis_jobs`
- CSV import idempotency via `conversation_responses.import_batch_id`
- Analysis status/error fields on `conversations` (`analysis_status`, `analysis_error`)
- Theme + clustering results (`conversation_themes`, response `x/y/cluster_index`)
- Hive invite links via `hive_invite_links` (token-based join links)
- Profile avatars via `profiles.avatar_path`
- Hive visibility via `hives.visibility` (public/private; private hives hidden from search and require invite link to join)

## Notes

- `008_allow_public_invite_preview.sql` was an interim migration that made invite links publicly readable; `009_remove_public_invite_preview_policy.sql` removes that policy. Invite preview is served via `GET /api/invites/[token]/preview` using the service role (server-side).
