# Feature Map (Flows → Code)

Use this as a quick index from a product feature to the exact files that implement it.
When adding/changing behavior, prefer updating the `lib/**/server/*` service and its tests, then keep routes/UI thin.

## Auth & Session

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| Login / register / callback | `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/(auth)/callback/page.tsx` | `app/api/auth/session/route.ts` | Canonical module: `lib/auth/*` (server: `lib/auth/server/requireAuth.ts`, react: `lib/auth/react/*`) | `app/tests/hooks/useAuth.test.ts`, `app/tests/hooks/useSession.test.ts`, `lib/auth/server/__tests__/sessionValidation.test.ts` |
| Logout | `app/(auth)/logout/page.tsx` | `app/api/auth/logout/route.ts` | `lib/auth/server/requireAuth.ts` (session) | `app/tests/supabase-auth-cookie.test.ts` |

## Hives

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| List my hives | `app/hives/page.tsx`, `app/hives/HivesHome.tsx` | `app/api/hives/route.ts` (GET) | Server list: `lib/hives/server/getHivesWithSignedUrls.ts` | (coverage lives mostly in server tests; add feature tests in `app/tests` when changing behavior) |
| Create hive | `app/hives/HivesHome.tsx` | `app/api/hives/route.ts` (POST) | Validation: `lib/hives/data/hiveSchemas.ts` | (add integration tests in `app/tests/api` if you touch this) |
| Hive details + conversations | `app/hives/[hiveId]/page.tsx` | `app/api/hives/[hiveId]/route.ts` (GET) | Hive resolution: `lib/hives/data/hiveResolver.ts`; conversations list: `lib/conversations/server/listHiveConversations.ts` | (see conversation tests below) |
| Hive stats | (consumed by client overview) | `app/api/hives/[hiveId]/stats/route.ts` | (route is currently the logic) | (add `app/tests/api` coverage if changing) |
| Hive settings (view) | `app/hives/[hiveId]/settings/page.tsx` | `app/api/hives/[hiveId]/route.ts` (GET) | View model + authz: `lib/hives/server/getHiveSettings.ts` | `lib/hives/server/authorizeHiveAdmin.test.ts` |
| Hive settings (update) | `app/hives/[hiveId]/settings/SettingsClient.tsx` | `app/api/hives/[hiveId]/route.ts` (PATCH) | Validation: `lib/hives/data/hiveSchemas.ts` | `lib/hives/server/authorizeHiveAdmin.test.ts` |
| Members list | `app/hives/[hiveId]/members/page.tsx` | (none; server fetch) | `lib/members/server/getMembersWithSignedUrls.ts` | `lib/members/validation/memberValidation.test.ts` |
| Invite members | `app/hives/[hiveId]/invite/page.tsx` | `app/api/hives/[hiveId]/invite/route.ts` (POST), `app/api/hives/[hiveId]/invites/route.ts` (GET), `app/api/hives/[hiveId]/invites/[inviteId]/route.ts` (DELETE) | Client hook: `lib/hives/react/useInvites.ts`; API client: `lib/hives/data/hiveClient.ts`; validation: `lib/hives/data/hiveSchemas.ts` | (add `app/tests/api` coverage if changing) |

## Conversations (Lifecycle)

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| Create conversation (session) | `app/components/new-session-wizard.tsx`, `lib/conversations/react/useNewSessionWizard.ts` | `app/api/conversations/route.ts` (POST) | Validation: `lib/conversations/schemas.ts`; service: `lib/conversations/server/createConversation.ts` | `app/tests/api/conversations-create.test.ts` |
| Conversation routing helpers | (used in UI) | (n/a) | `lib/conversations/routes.ts` | (unit-test if you add complexity) |
| Conversation base → Listen redirect | `app/hives/[hiveId]/conversations/[conversationId]/page.tsx` | (n/a) | (simple redirect) | (n/a) |
| Listen tab (render + compose) | `app/hives/[hiveId]/conversations/[conversationId]/listen/page.tsx`, `app/components/conversation/ListenView.tsx` | `app/api/conversations/[conversationId]/responses/route.ts` (GET/POST) | Membership gate: `lib/conversations/server/requireHiveMember.ts`; tags: `lib/conversations/domain/tags.ts`; feed hook: `lib/conversations/react/useConversationFeed.ts` | `app/tests/api/responses.test.ts`, `lib/conversations/react/useConversationFeed.test.tsx` |
| Like a response | (Listen UI) | `app/api/responses/[responseId]/like/route.ts` (POST/DELETE) | Client: `lib/conversations/data/likesClient.ts` | (add `app/tests/api` coverage if changing) |
| Understand tab (themes + feedback) | `app/hives/[hiveId]/conversations/[conversationId]/understand/page.tsx`, `app/components/conversation/UnderstandView.tsx` | `app/api/conversations/[conversationId]/feedback/route.ts` (POST) | View model: `lib/conversations/server/getUnderstandViewModel.ts`; feedback hook: `lib/conversations/react/useConversationFeedback.ts` | `lib/conversations/react/useConversationFeedback.test.tsx` |
| Upload CSV responses | `lib/conversations/react/useNewSessionWizard.ts` | `app/api/conversations/[conversationId]/upload/route.ts` (POST) | Importer: `lib/conversations/server/importResponsesFromCsv.ts` | `lib/conversations/server/__tests__/importResponsesFromCsv.test.ts` |
| Trigger analysis | `lib/conversations/react/useNewSessionWizard.ts` | `app/api/conversations/[conversationId]/analyze/route.ts` (POST) | Queueing: `lib/conversations/server/enqueueConversationAnalysis.ts`; worker+pipeline: `scripts/README.md`, `scripts/analysis-worker.ts`, `lib/conversations/server/runConversationAnalysis.ts` | (pipeline is covered via unit tests around domain helpers; add integration tests if you change orchestration) |
| Result/Report tab (view) | `app/hives/[hiveId]/conversations/[conversationId]/result/page.tsx`, `app/components/conversation/ReportView.tsx` | (read via server) | View model: `lib/conversations/server/getReportViewModel.ts`; gating: `lib/conversations/domain/reportRules.ts` | `lib/conversations/domain/__tests__/reportRules.test.ts` |
| Generate report version | (Report UI) | `app/api/conversations/[conversationId]/report/route.ts` (POST) | Gating: `lib/conversations/domain/reportRules.ts`; admin gate: `lib/conversations/server/requireHiveAdmin.ts`; client: `lib/conversations/data/reportClient.ts` | `lib/conversations/domain/__tests__/reportRules.test.ts` |
| Delete conversation | (Hive UI) | `app/api/conversations/[conversationId]/route.ts` (DELETE) | Admin gate: `lib/conversations/server/requireHiveAdmin.ts` | (add `app/tests/api` coverage if changing) |

## Shared Types (Contracts)

- Conversations: `types/conversations.ts`, `types/conversation-understand.ts`, `types/conversation-report.ts`
- Hives/members/settings: `types/members.ts`, `types/hive-settings.ts`, plus domain-ish types in `lib/hives/domain/hive.types.ts`
