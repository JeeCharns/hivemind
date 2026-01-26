# Repository Guidelines

## Start Here (Core Logic Map)

- Docs index: `docs/README.md`
- Architecture map: `docs/ARCHITECTURE.md`
- Feature map: `docs/feature-map.md`
- Setup (env, migrations, worker): `docs/setup/README.md`
- ADRs (architecture decisions): `docs/decisions/README.md`
- Golden paths (copyable examples): `docs/examples/golden-path-api.md`
- Analysis worker: `scripts/README.md`
- Auth module docs: `lib/auth/README.md`

## Project Structure & Module Organization

- Next.js App Router lives in `app/`; route groups like `(auth)` handle login/register/logout, `(hives)` contains hive dashboards plus nested conversation handlers, and API routes sit under `app/api`.
- Shared UI primitives are in `app/components`; feature hooks/services in `lib`; shared types in `types`. Keep route handlers and UI components focused on a single concern.
- Unit and integration tests are colocated in `app/tests`; Playwright end-to-end specs live in `tests/e2e`. Place new tests near the feature they cover and keep fixtures small.

## Build, Test, and Development Commands

- `npm run dev` starts the local dev server on port 3000 with HMR.
- `npm run build` builds for production; `npm run start` serves the built app.
- `npm run lint` runs ESLint (Next.js config).
- `npm run typecheck` runs `tsc --noEmit` for a fast type-safety check.
- `npm test` runs the Jest suite; `npm run test:watch` for focused iterations.
- `npm run test:e2e` runs Playwright specs in `tests/e2e`; ensure the app is running or set `BASE_URL`.
- `npm run format` checks formatting; `npm run format:write` applies Prettier.
- `npm run lint:staged` runs Prettier/ESLint on changed files (used in CI).

## Coding Style & Naming Conventions

- TypeScript is `strict`; prefer explicit types over `any` and export shared shapes from `types/`.
- Use 2-space indentation, keep existing quote style (`"`), and avoid unused imports. Run `npm run lint` before pushing.
- Components and hooks use `PascalCase` and `use` prefixes; route segments and files use `kebab-case` where applicable.
- Favor `@/*` path aliases over long relative imports. Separate rendering from data fetching or stateful logic to maintain SRP.
- **Language**: Use British English spelling in all user-facing text and comments (e.g., "analysing" not "analyzing", "colour" not "color", "organised" not "organized"). Note: Database enum values and existing API contracts should not be changed.

## Code Quality Principles (CLAUDE-aligned)

- SRP/separation: keep UI presentational (`app/components/*`), keep business logic in `lib/**` (prefer `lib/**/server/*` + `lib/**/domain/*`), keep shared contracts in `types/*`.
- SOLID/DIP: inject external dependencies (e.g. `SupabaseClient`) into `lib/**/server/*` functions; prefer small, mockable interfaces over hard-coded globals.
- Validate boundaries: runtime-validate external input (API request bodies, uploads, CSV) with Zod (typically `lib/**/schemas.ts` / `lib/**/data/*`); never trust client input.
- Error handling: return stable API errors (`error` + optional `code`), avoid leaking internal details, and log with enough context for debugging.
- Security: enforce authz centrally (`requireHiveMember`, `requireHiveAdmin`, `authorizeHiveAdmin`); prefer conservative checks and avoid duplicating auth logic in pages/components.
- Performance: avoid N+1 queries, batch DB updates where possible, dedupe concurrent requests, and keep heavy work async (e.g. analysis worker).
- Testing: add/adjust tests for unhappy paths and authorization gates, not just happy paths; mock IO (`fetch`, storage, timers) for determinism.

## Default Workflow (For Agents)

- Orient: read `docs/feature-map.md` and the closest owner README for the area you’re changing.
- Implement: keep routes thin; put logic in `lib/**/server/*` + `lib/**/domain/*` with injected dependencies.
- Validate: add/extend Zod schemas at boundaries; keep API responses stable.
- Test: add/adjust unit/integration tests near the feature; avoid network calls.
- Docs: update the closest owner doc + `docs/feature-map.md` when flows change.
- Gates: run required commands from “Processes and Tools”.

## TypeScript Rules

- Avoid `any` in production code; prefer `unknown` + narrowing.
- `any` is acceptable in tests only when unavoidable, and should be localized to test scaffolding/mocks.

## Processes and Tools

This repo treats tooling as a quality gate (not optional advice).

- Required before finishing work:
  - `npm run lint`
  - `npm test`
  - `npm run typecheck`
  - `npm run build` when touching routing, Next config, or build tooling
  - `npm run test:e2e` when changing real user flows
- Boundary validation required: validate all external input (API request bodies, uploads/CSV) with Zod (`lib/**/schemas.ts` / `lib/**/data/*`); never trust client input.
- Docs process (no one-off docs): when behavior changes, update the closest owner doc (`docs/*` or `lib/*/README.md`); when flows/routes change, also update `docs/feature-map.md`.
- Formatting:
  - Prettier is configured; use `npm run format` (check) and `npm run format:write` (apply).
  - lint-staged is configured for CI (runs Prettier/ESLint on changed files); optional local run via `npm run lint:staged`.
  - Husky is not configured; rely on CI and the required commands above.
  - Local Node should match CI (`.nvmrc`).

## Testing Guidelines

- Jest + Testing Library cover units/integration. Name files `*.test.ts`/`*.test.tsx` mirroring the module under test.
- Required coverage (where applicable):
  - Happy path (at least one)
  - Validation errors (`400`)
  - Auth errors (`401`/`403`)
  - Not found (`404`)
  - Empty states (e.g. no rows/results)
- Prefer colocated tests:
  - `app/tests/*` for route/UI integration
  - `lib/**/__tests__/*` for service/domain logic
  - Test `lib/**/server/*` services directly where possible (inject/mocks for dependencies).
- Determinism: mock external IO (Supabase/OpenAI/`fetch`/storage/timers) and avoid network calls in unit/integration tests.
- API route testing:
  - Mock `requireAuth` / `getServerSession` and `supabaseServerClient`.
  - Assert a stable error response shape (`error` + optional `code`), not raw stack traces.
- E2E (Playwright):
  - Only add/modify specs when a real user journey changes.
  - Prefer stable selectors over text; keep specs idempotent and clean up any created data.

## Commit & Pull Request Guidelines

- Write short, imperative commit titles (e.g., `Fix hive redirect loop #123`). Group related changes; avoid unrelated refactors in the same commit.
- PRs should summarize scope, risks, and testing performed (`npm test`, `npm run lint`, `npm run test:e2e`). Add screenshots/GIFs for UI changes and note required env keys in the description.
- Do not commit secrets; keep credentials in `.env.local` and share requirements via documentation or PR notes.

## Definition of Done (When Shipping Changes)

- Tests/lint: run the most relevant commands (`npm run lint`, `npm test`, and/or `npm run test:e2e` as appropriate).
- Docs: do a quick doc impact scan; update `docs/feature-map.md` when flows/routes change and update the closest owner doc in `docs/`/`lib/*/README.md` when behavior changes.
- API contracts: if you touched `app/api/**`, ensure request/response validation exists and errors are stable (`error` + optional `code`).
- Authz: if you touched hive/conversation/member data paths, ensure membership/admin checks are enforced in `lib/**/server/*` or in the route before DB operations.
- UI quality: if you touched interactive UI, ensure accessibility basics (labels, keyboard support, semantic elements).

## API Contract Rules

- Every `app/api/**/route.ts` must validate inputs with Zod (request body, query params, uploads).
- Prefer also validating response payloads at the edge (Zod response schema) for consistency, especially for public/shared endpoints.
- Centralize request/response types in `types/<domain>-api.ts` (and shared shapes in `types/api.ts`) so clients, routes, and tests reuse the same contracts.
- Errors should be stable and machine-readable: `{ error: string, code?: string }` (use `jsonError` from `lib/api/errors.ts`).

## ADR Rule (Architecture/Infra Changes)

- If you introduce/modify infrastructure or architecture decisions (runtime deps, schema/migrations strategy, cross-cutting patterns), add an ADR under `docs/decisions/` and list it in `docs/decisions/README.md`.

## Authorization Checklist (When Accessing Data)

- Authenticate (session required? choose `requireAuth()` vs `getServerSession()`).
- Resolve identifiers (slug/UUID) before querying where applicable.
- Enforce membership/admin via centralized guards (`requireHiveMember`, `requireHiveAdmin`, `authorizeHiveAdmin`).
- Only then read/write data; avoid duplicating authz logic across UI components.

## Observability & Logging

- Use consistent log prefixes per route/service (e.g. `[POST /api/conversations]`, `[createConversation]`).
- Never log secrets/tokens or raw cookies; keep logs actionable (ids, status, error message).

## UI Readability & Usability Baseline

- Prefer semantic HTML elements and labels for form inputs.
- Avoid `alert()` for production UX; use in-app error surfaces (alert/toast/banner components).
- Ensure keyboard access for menus/modals; close on Escape where applicable.

## Routing Hygiene (Next.js)

- Avoid duplicating route trees (e.g. `app/hives/*` vs `app/(hives)/*`) unless intentional.
- If a second route tree is intentional, document the canonical path and rationale in `docs/ARCHITECTURE.md`.
- Middleware/proxy: this repo uses `proxy.ts` as the Next.js entrypoint. Do not add `middleware.ts` (having both triggers a runtime error and the app won’t start).

## Supabase Environment Variables (Naming Convention)

- Client/browser: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (do not use `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Server/scripts: `SUPABASE_SECRET_KEY` (service role key; legacy alias `SUPABASE_SERVICE_ROLE_KEY` may exist)
