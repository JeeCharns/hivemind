# `(hives)` Route Group

This group contains hive-related UI and supporting client-side modules.

## Note on Routes

There are currently two hive route structures:

- `app/hives/*` maps to `/hives/*` and is the primary server-component implementation.
- `app/(hives)/[hiveId]/page.tsx` maps to `/<hiveId>` (route group doesn’t add a segment) and appears to be a client-side overview page.

When adding new user-facing routes, prefer `/hives/*` under `app/hives/*` unless you’re intentionally working on the top-level `/<hiveId>` route.

## Key Code Pointers

- Hive services: `lib/hives/*`, `lib/members/*`
- Conversation services: `lib/conversations/*`
- Shared UI: `app/components/*`

