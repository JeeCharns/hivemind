# Hivemind Docs (Start Here)

This folder is the “how this repo works” index for humans and coding agents.
Prefer linking to real code (files/functions) over rewriting logic in prose.

## Core Domains (Where to Look)

- Hives (membership, settings, invites): `lib/hives/*`, `lib/members/*`
- Auth & session: `lib/auth/README.md`
- Conversations (lifecycle): `lib/conversations/README.md`
- Analysis worker (async pipeline): `scripts/README.md`
- Supabase integration (clients, cookies): `lib/supabase/*`
- Storage (logos, URL validation): `lib/storage/*`
- Navbar view model + membership checks: `lib/navbar/*`

## High-Level Flow (Request → Data → UI)

1. Route handlers and Server Components authenticate (`lib/auth/server/*`) and build a Supabase client (`lib/supabase/serverClient.ts`).
2. “Business logic” lives in small server functions under `lib/**/server/*` (authorization + DB orchestration).
3. Runtime validation for API boundaries uses Zod schemas under `lib/**/data/*` or `lib/**/schemas.ts`.
4. Client-side hooks under `lib/**/react/*` call API routes or clients and return view models for components.
5. Shared, stable data shapes live in `types/*` (especially `types/conversations.ts`, `types/hive-settings.ts`, `types/members.ts`).

## Start Points (Common Tasks)

- Add a new feature: `docs/playbooks/add-a-feature.md`
- Understand system boundaries: `docs/ARCHITECTURE.md`
- Feature → code map: `docs/feature-map.md`
- Setup (env, migrations, worker): `docs/setup/README.md`
- Golden paths (reference implementations): `docs/examples/golden-path-api.md`
- ADR index: `docs/decisions/README.md`
- Record a decision (ADR): `docs/decisions/adr-template.md`

## Tests (Where They Live)

- Unit/integration (Jest + Testing Library): `app/tests/*`, plus module tests under `lib/**/__tests__/*`
- E2E (Playwright): `tests/e2e/*`
