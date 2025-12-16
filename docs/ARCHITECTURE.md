# Architecture Overview

This repo uses a simple “thin routes + tested services” approach:

- UI stays in `app/` (React components, layouts, pages).
- Business logic stays in `lib/` (server services, clients, hooks).
- Contracts stay in `types/` (shared types + view models).
- Concrete flow index: `docs/feature-map.md`

## Layers and Boundaries

1. **UI (rendering only)**: `app/components/*`, `app/**/page.tsx`
2. **Route orchestration (thin)**:
   - API routes: `app/api/**/route.ts`
   - Server Components: `app/hives/**/page.tsx` (fetch + authorize + pass view models)
3. **Business logic (testable)**:
   - Server services: `lib/**/server/*` (authorization + orchestration)
   - Domain rules/helpers: `lib/**/domain/*` (pure functions)
   - Data clients/schemas: `lib/**/data/*`, `lib/**/schemas.ts` (runtime validation + IO adapters)
4. **Integration**:
   - Supabase: `lib/supabase/*`
   - OpenAI analysis: `lib/analysis/*`

## Core Business Objects

- **Hive**: group of members and conversations (see `lib/hives/domain/hive.types.ts`)
- **Membership/roles**: membership checks + admin gates (see `lib/hives/server/authorizeHiveAdmin.ts`, `lib/conversations/server/requireHiveMember.ts`)
- **Conversation**: created in `listen_open` phase; analysis produces themes + report artifacts (see `types/conversations.ts`, `lib/conversations/server/runConversationAnalysis.ts`)

## Feature Map (Code Pointers)

### Auth & session

- Server guards: `lib/auth/server/requireAuth.ts`, `lib/auth/server/sessionValidation.ts`
- Client state + hooks: `lib/auth/react/*`, `lib/auth/state/sessionStore.ts`
- Middleware: `lib/auth/server/middleware.ts`

### Hives

- Key resolution (slug or UUID): `lib/hives/data/hiveResolver.ts`
- Settings view model (+ signed logos): `lib/hives/server/getHiveSettings.ts`
- Admin authorization: `lib/hives/server/authorizeHiveAdmin.ts`

### Conversations

- Create: `lib/conversations/server/createConversation.ts` (+ API: `app/api/conversations/route.ts`)
- Resolve hive+conversation keys: `lib/conversations/server/resolveHiveAndConversation.ts`
- Listing for hive home: `lib/conversations/server/listHiveConversations.ts`
- Analysis pipeline: `lib/conversations/server/runConversationAnalysis.ts` (+ worker: `scripts/README.md`)
- Deletion cascade (API): `app/api/conversations/[conversationId]/route.ts`

### Feedback/likes

- Response likes API: `app/api/responses/[responseId]/like/route.ts`
- Clients: `lib/conversations/data/*`

## Invariants (Guardrails)

- Keep business logic out of `page.tsx` and route handlers: they should authenticate/authorize, validate input, call a `lib/**/server/*` function, and return a response.
- Every external boundary (API request bodies, CSV imports) gets runtime validation (Zod).
- Authorization is explicit and centralized (`requireHiveMember`, `requireHiveAdmin`, `authorizeHiveAdmin`).
