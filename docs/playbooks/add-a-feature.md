# Playbook: Add a Feature (Repo-Consistent)

Use this when implementing anything non-trivial so changes land in the right places.

## 1) Define the contract

- Add/extend shared types in `types/*` (or `lib/<feature>/domain/*` for internal-only types).
- If it crosses an API boundary, centralize request/response shapes in `types/<feature>-api.ts` (shared shapes in `types/api.ts`).
- If it crosses an API boundary, add a Zod schema (typically `lib/<feature>/schemas.ts` or `lib/<feature>/data/*`).

## 2) Implement the server-side business logic

- Add a focused function under `lib/<feature>/server/*`.
- Inject `SupabaseClient` and any external dependencies as parameters for testability.
- Perform authorization inside the service (`requireHiveMember`, `requireHiveAdmin`, etc.).

## 3) Wire it to an API route (if needed)

In `app/api/**/route.ts`:

- Authenticate (`requireAuth()` for “must be logged in”, `getServerSession()` for optional auth).
- Validate request body with Zod.
- Call the `lib/**/server/*` function and translate errors into stable error codes (prefer `jsonError` from `lib/api/errors.ts`).

## 4) Add client access (hook/client)

- Prefer a hook under `lib/<feature>/react/*` for UI consumption.
- Keep UI components in `app/components/*` dumb: accept props/view models and render.

## 5) Test the behavior

- Unit/integration: colocate tests in `app/tests/*` or `lib/**/__tests__/*`.
- Assert unhappy paths (validation errors, unauthorized, empty states), not just the happy path.
- E2E (if user-visible flow): add to `tests/e2e/*`.

## 6) Update docs (small but real)

- Add a short note in `docs/ARCHITECTURE.md` if you introduced a new “domain”.
- Add/extend a scoped README if it changes how a folder should be used.
