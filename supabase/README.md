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
14. `supabase/migrations/024_decision_space_tables.sql` (decision space: proposals, rounds, votes, results for decision sessions)
15. `supabase/migrations/025_add_missing_fk_indexes.sql` (add covering indexes for all unindexed foreign keys)
16. `supabase/migrations/026_fix_rls_initplan_performance.sql` (wrap auth.uid()/auth.role() in select for RLS performance)
17. `supabase/migrations/027_drop_duplicate_analysis_jobs_index.sql` (drop duplicate unique index on conversation_analysis_jobs)
18. `supabase/migrations/028_fix_function_search_paths.sql` (set search_path on all public functions to prevent hijacking)
19. `supabase/migrations/029_enable_missing_rls.sql` (enable RLS on conversation_cluster_models, conversation_response_embeddings, conversation_analysis_jobs)
20. `supabase/migrations/030_tighten_rls_batch_a.sql` (replace USING(true) policies on profiles, conversation_themes, conversation_attachments, quadratic_vote_allocations, quadratic_vote_budgets)
21. `supabase/migrations/031_tighten_rls_batch_b.sql` (replace USING(true) policies on conversations, conversation_responses, hive_members, hives, response_feedback)
22. `supabase/migrations/032_consolidate_permissive_policies.sql` (drop redundant service-role FOR ALL policies, old duplicates, and split hive_invite_links admin FOR ALL into targeted UPDATE/DELETE)
23. `supabase/migrations/033_consolidate_decision_votes_select.sql` (merge two decision_votes SELECT policies into one combined policy)
24. `supabase/migrations/036_create_social_tables.sql` (Welcome Hive social features: activity, reactions, presence)
25. `supabase/migrations/037_add_system_hive_column.sql` (add is_system_hive column to hives table)

## What These Migrations Enable

- Async conversation analysis queue via `conversation_analysis_jobs`
- CSV import idempotency via `conversation_responses.import_batch_id`
- Analysis status/error fields on `conversations` (`analysis_status`, `analysis_error`)
- Theme + clustering results (`conversation_themes`, response `x/y/cluster_index`)
- Hive invite links via `hive_invite_links` (token-based join links)
- Profile avatars via `profiles.avatar_path`
- Hive visibility via `hives.visibility` (public/private; private hives hidden from search and require invite link to join)
- Welcome Hive social features:
  - `hive_activity` table: activity events (join, response, vote, phase_change) with hive-scoped queries
  - `hive_reactions` table: emoji reactions (wave, party, lightbulb, heart, bee) with optional short messages
  - `user_presence` table: last active timestamp per user per hive for "who's online" display
  - `hives.is_system_hive` column: marks protected system hives (e.g., Welcome Hive) that cannot be deleted

## Convention: Foreign Key Indexes

Postgres does **not** auto-create indexes on foreign key columns. Without a covering index, `DELETE`/`UPDATE` on the parent table triggers a sequential scan on the child.

**Rule:** every migration that adds a foreign key must include a matching `CREATE INDEX` for the FK column(s). Name it `idx_<table>_<column>`.

## Convention: RLS Init Plan

Always wrap `auth.uid()` and `auth.role()` calls in RLS policies with `(select ...)` so Postgres evaluates them once per query, not once per row:

```sql
-- Bad:  hm.user_id = auth.uid()
-- Good: hm.user_id = (select auth.uid())
```

## Notes

- `008_allow_public_invite_preview.sql` was an interim migration that made invite links publicly readable; `009_remove_public_invite_preview_policy.sql` removes that policy. Invite preview is served via `GET /api/invites/[token]/preview` using the service role (server-side).
