# Repository Guidelines

## Project Structure & Module Organization

- Next.js App Router lives in `app/`; route groups like `(auth)` handle login/register/logout, `(hives)` contains hive dashboards plus nested conversation handlers, and API routes sit under `app/api`.
- Shared UI primitives are in `app/components`; feature hooks/services in `lib`; shared types in `types`. Keep route handlers and UI components focused on a single concern.
- Unit and integration tests are colocated in `app/tests`; Playwright end-to-end specs live in `tests/e2e`. Place new tests near the feature they cover and keep fixtures small.

## Build, Test, and Development Commands

- `npm run dev` starts the local dev server on port 3000 with HMR.
- `npm run build` builds for production; `npm run start` serves the built app.
- `npm run lint` runs ESLint (Next.js config).
- `npm test` runs the Jest suite; `npm run test:watch` for focused iterations.
- `npm run test:e2e` runs Playwright specs in `tests/e2e`; ensure the app is running or set `BASE_URL`.

## Coding Style & Naming Conventions

- TypeScript is `strict`; prefer explicit types over `any` and export shared shapes from `types/`.
- Use 2-space indentation, keep existing quote style (`"`), and avoid unused imports. Run `npm run lint` before pushing.
- Components and hooks use `PascalCase` and `use` prefixes; route segments and files use `kebab-case` where applicable.
- Favor `@/*` path aliases over long relative imports. Separate rendering from data fetching or stateful logic to maintain SRP.

## Processes and Tools

- Use ESLint with Next.js/TypeScript preset to ensure consistent code quality.
- Set up Prettier for automatic code formatting to enforce a consistent style across all developers.
- Use Husky and lint-staged to run eslint and prettier checks before every commit.

## Testing Guidelines

- Jest + Testing Library cover units/integration. Name files `*.test.ts`/`*.test.tsx` mirroring the module under test.
- Mock external effects (`fetch`, storage, timers) to keep tests deterministic; assert error and loading paths, not just happy flows.
- Playwright specs in `tests/e2e` should be idempotent and clean up any created data. Prefer stable selectors over text when possible.

## Commit & Pull Request Guidelines

- Write short, imperative commit titles (e.g., `Fix hive redirect loop #123`). Group related changes; avoid unrelated refactors in the same commit.
- PRs should summarize scope, risks, and testing performed (`npm test`, `npm run lint`, `npm run test:e2e`). Add screenshots/GIFs for UI changes and note required env keys in the description.
- Do not commit secrets; keep credentials in `.env.local` and share requirements via documentation or PR notes.
