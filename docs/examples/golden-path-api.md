# Golden Path: API Route + Service + Schema + Test

Use this as a template-quality reference for how to build production-ready API endpoints in this repo.

## Reference implementation (copy the pattern, not the feature)

- Zod schema: `lib/conversations/schemas.ts`
- Server service: `lib/conversations/server/createConversation.ts`
- API route (thin orchestration): `app/api/conversations/route.ts`
- Integration test: `app/tests/api/conversations-create.test.ts`
- API error helper: `lib/api/errors.ts`
- API contracts: `types/api.ts`, `types/conversations-api.ts`

## Checklist

- Validate inputs with Zod at the boundary
- Authenticate/authorize at the route, enforce membership/admin inside the service when appropriate
- Keep route handlers thin (translate HTTP ↔ service calls)
- Return stable error shape (`{ error, code? }`) and consistent status codes
- Write tests for: happy path, `400`, `401/403`, `404` (if applicable), empty state
