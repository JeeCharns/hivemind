# `lib/` (Business Logic)

`lib/` is the home for testable, reusable logic that should not live in route handlers or React components.

## Conventions

- `lib/<feature>/server/*`: server-side business logic (authz + DB orchestration)
- `lib/<feature>/data/*`: IO adapters, repositories/clients, schemas
- `lib/<feature>/domain/*`: pure rules, formatting, transforms
- `lib/<feature>/react/*`: hooks/providers/guards for UI consumption

## Guardrail

If a file needs `SupabaseClient`, prefer putting it under `server/` (or a `data/` client) and inject it for tests.
