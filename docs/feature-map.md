# Feature Map (Flows → Code)

Use this as a quick index from a product feature to the exact files that implement it.
When adding/changing behavior, prefer updating the `lib/**/server/*` service and its tests, then keep routes/UI thin.

## Auth & Session

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| Login / register / callback | `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/(auth)/callback/page.tsx` | `app/api/auth/session/route.ts` | Canonical module: `lib/auth/*` (server: `lib/auth/server/requireAuth.ts`, react: `lib/auth/react/*`) | `app/tests/hooks/useAuth.test.ts`, `app/tests/hooks/useSession.test.ts`, `lib/auth/server/__tests__/sessionValidation.test.ts` |
| Logout | `app/(auth)/logout/page.tsx` | `app/api/auth/logout/route.ts` | `lib/auth/server/requireAuth.ts` (session) | `app/tests/supabase-auth-cookie.test.ts` |

## Profile Onboarding

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| Profile setup (onboarding) | `app/profile-setup/page.tsx`, `app/profile-setup/ProfileSetupForm.tsx` | `app/api/profile/route.ts` (POST multipart/form-data) | Server services: `lib/profile/server/upsertProfile.ts`, `lib/profile/server/uploadAvatar.ts`; validation: `lib/profile/schemas.ts` (displayName 1-60 chars, avatar <2MB); storage: avatars bucket (configurable via `lib/storage/avatarBucket.ts`) | `app/tests/api/profile.test.ts`, `lib/profile/server/__tests__/upsertProfile.test.ts` |
| Check profile status | `app/(auth)/callback/page.tsx` (routes to /profile-setup if needed) | `app/api/profile/status/route.ts` (GET) | Server service: `lib/profile/server/getProfileStatus.ts`; returns `{ hasProfile, needsSetup }` | `app/tests/api/profile.test.ts` |
| Avatar upload (reusable) | `app/components/ImageUpload.tsx` (used in profile setup and settings) | (handled by POST /api/profile) | Uploads to avatars bucket with path `userId/uuid.extension`; auto-deletes old avatars | (covered by upsertProfile tests) |

## Account Settings

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| View account settings | `app/settings/page.tsx`, `app/settings/AccountSettingsForm.tsx` (canonical route: `/settings`; `/account` redirects to `/settings`) | `app/api/account/route.ts` (GET) | Server service: `lib/account/server/getAccountSettings.ts`; returns `{ email, displayName, avatarUrl }` | `app/tests/api/account.test.ts`, `lib/account/server/__tests__/getAccountSettings.test.ts` |
| Update account profile | `app/settings/AccountSettingsForm.tsx` (wraps shared `ProfileForm`) | `app/api/account/profile/route.ts` (POST multipart/form-data) | Server service: `lib/account/server/updateAccountProfile.ts` (thin wrapper around `upsertProfile`); validation: reuses `lib/profile/schemas.ts` (displayName 1-60 chars, avatar <2MB) | `app/tests/api/account.test.ts`, `lib/account/server/__tests__/updateAccountProfile.test.ts` |
| Shared profile form | `app/components/profile/ProfileForm.tsx` (reusable form for both profile setup and account settings) | (uses different endpoints via `apiEndpoint` prop: `/api/profile` for onboarding, `/api/account/profile` for settings) | Supports callback props for different routing needs: `onSuccess`, `showSuccessMessage` | (covered by profile and account API tests) |

## Hives

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| List my hives | `app/hives/page.tsx`, `app/hives/HivesHome.tsx` | `app/api/hives/route.ts` (GET) | Server list: `lib/hives/server/getHivesWithSignedUrls.ts` | (coverage lives mostly in server tests; add feature tests in `app/tests` when changing behavior) |
| Create hive (3-step wizard) | Entry: `app/hives/HivesHome.tsx` → `/hives/new`; Wizard: `app/hives/new/page.tsx`, `app/hives/new/new-hive-wizard.tsx` (Step 1: name+logo, Step 2: draft invites, Step 3: create+invite orchestration) | `app/api/hives/route.ts` (POST create), `app/api/hives/[hiveId]/invite/route.ts` (POST invites) | Create service: `lib/hives/server/createHive.ts`; invite validation: `lib/hives/data/hiveSchemas.ts`; validation: `lib/hives/schemas.ts`; See: `docs/specs/create-hive-wizard.md` | `app/tests/api/hives-create.test.ts`, `app/tests/api/hives-invite.test.ts` |
| Search hives | `app/hives/components/JoinHiveSearch.tsx` | `app/api/hives/search/route.ts` (GET) | Server service: `lib/hives/server/searchJoinableHives.ts`; validation: Zod schema in route (term 1-80 chars, limit 1-10) | `app/tests/api/hives-search.test.ts` |
| Join a hive | `app/hives/components/JoinHiveSearch.tsx` | `app/api/hives/[hiveId]/join/route.ts` (POST) | Server service: `lib/hives/server/joinHive.ts` (idempotent upsert); validation: Zod UUID check | `app/tests/api/hives-join.test.ts` |
| Hive details + conversations | `app/hives/[hiveId]/page.tsx` | `app/api/hives/[hiveId]/route.ts` (GET) | Hive resolution: `lib/hives/data/hiveResolver.ts`; conversations list: `lib/conversations/server/listHiveConversations.ts` | (see conversation tests below) |
| Hive stats | (consumed by client overview) | `app/api/hives/[hiveId]/stats/route.ts` | (route is currently the logic) | (add `app/tests/api` coverage if changing) |
| Hive settings (view) | `app/hives/[hiveId]/settings/page.tsx` | `app/api/hives/[hiveId]/route.ts` (GET) | View model + authz: `lib/hives/server/getHiveSettings.ts` | `lib/hives/server/authorizeHiveAdmin.test.ts` |
| Hive settings (update) | `app/hives/[hiveId]/settings/SettingsClient.tsx` | `app/api/hives/[hiveId]/route.ts` (PATCH) | Validation: `lib/hives/data/hiveSchemas.ts` | `lib/hives/server/authorizeHiveAdmin.test.ts` |
| Members list | `app/hives/[hiveId]/members/page.tsx` | (none; server fetch) | `lib/members/server/getMembersWithSignedUrls.ts` | `lib/members/validation/memberValidation.test.ts` |
| Invite members (email-based) | `app/hives/[hiveId]/invite/page.tsx` | `app/api/hives/[hiveId]/invite/route.ts` (POST), `app/api/hives/[hiveId]/invites/route.ts` (GET), `app/api/hives/[hiveId]/invites/[inviteId]/route.ts` (DELETE) | Client hook: `lib/hives/react/useInvites.ts`; API client: `lib/hives/data/hiveClient.ts`; validation: `lib/hives/data/hiveSchemas.ts` | (add `app/tests/api` coverage if changing) |
| Share hive via invite link | Entry: Conversation "Share" button (`app/components/conversation/ConversationHeader.tsx`), Hive invite page; Modal: `app/hives/components/HiveShareInvitePanel.tsx` | `app/api/hives/[hiveId]/share-link/route.ts` (GET/PATCH), `app/api/invites/[token]/preview/route.ts` (GET, public), `app/api/invites/[token]/accept/route.ts` (POST) | Server service: `lib/hives/server/shareLinkService.ts`; validation: `lib/hives/schemas.ts`; two access modes: 'anyone' (any user with link), 'invited_only' (only invited emails can join); See: `docs/specs/hive-share-invite-links.md` | (add `app/tests/api` coverage if changing) |
| Accept invite link | `app/invite/[token]/page.tsx` (redirects to login if not authed, then accepts invite) | `app/api/invites/[token]/accept/route.ts` (POST) | Idempotent join; validates email whitelist for 'invited_only' mode; marks invite accepted; See: `docs/specs/hive-share-invite-links.md` | (add `app/tests/api` coverage if changing) |
| Login with join intent | `app/(auth)/login/page.tsx` (shows "Enter your email to join {HiveName}" header when `?intent=join&invite=<token>`) | `app/api/invites/[token]/preview/route.ts` (GET, public, fetches hive name) | After login, callback returns to `/invite/<token>` which triggers accept flow; See: `docs/specs/hive-share-invite-links.md` | (add `app/tests` coverage if changing) |

## Conversations (Lifecycle)

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| Create conversation (session) | `app/components/new-session-wizard.tsx`, `lib/conversations/react/useNewSessionWizard.ts` | `app/api/conversations/route.ts` (POST) | Validation: `lib/conversations/schemas.ts` (supports `sourceConversationId` and `sourceReportVersion` for decision sessions); service: `lib/conversations/server/createConversation.ts` (validates source report exists and belongs to same hive) | `app/tests/api/conversations-create.test.ts` |
| List problem reports for decision session wizard | `app/components/new-session-wizard.tsx` (decision flow) | `app/api/hives/[hiveId]/problem-reports/route.ts` (GET) | Returns list of problem space conversations with reports; schema: `lib/conversations/schemas.ts` (problemReportListItemSchema) | (add test coverage if changing) |
| Preview problem report for decision session | `app/components/new-session-wizard.tsx` (decision flow) | `app/api/conversations/[conversationId]/report-preview/route.ts` (GET ?version=N) | Returns specific or latest report HTML for preview; schema: `lib/conversations/schemas.ts` (reportPreviewResponseSchema) | (add test coverage if changing) |
| Conversation routing helpers | (used in UI) | (n/a) | `lib/conversations/routes.ts` | (unit-test if you add complexity) |
| Conversation base → Listen redirect | `app/hives/[hiveId]/conversations/[conversationId]/page.tsx` | (n/a) | (simple redirect) | (n/a) |
| Listen tab (render + compose) | `app/hives/[hiveId]/conversations/[conversationId]/listen/page.tsx`, `app/components/conversation/ListenView.tsx` | `app/api/conversations/[conversationId]/responses/route.ts` (GET/POST; for decision sessions, tag is forced to "proposal") | Membership gate: `lib/conversations/server/requireHiveMember.ts`; tags: `lib/conversations/domain/tags.ts`; feed hook: `lib/conversations/react/useConversationFeed.ts` | `app/tests/api/responses.test.ts`, `lib/conversations/react/useConversationFeed.test.tsx` |
| Auto-trigger analysis (≥20 responses) | (triggered on response create / CSV import) | (part of POST responses / upload flow) | Auto-trigger: `lib/conversations/server/maybeEnqueueAutoAnalysis.ts` (uses `lib/conversations/server/enqueueConversationAnalysis.ts`) | `lib/conversations/server/__tests__/maybeEnqueueAutoAnalysis.test.ts`, `app/tests/api/responses.test.ts` |
| Like a response | (Listen UI) | `app/api/responses/[responseId]/like/route.ts` (POST/DELETE) | Client: `lib/conversations/data/likesClient.ts` | (add `app/tests/api` coverage if changing) |
| Understand tab (themes + feedback) | `app/hives/[hiveId]/conversations/[conversationId]/understand/page.tsx`, `app/components/conversation/UnderstandViewContainer.tsx`, `app/components/conversation/UnderstandView.tsx` | `app/api/conversations/[conversationId]/feedback/route.ts` (POST; returns 409 FEEDBACK_DISABLED for decision sessions), `app/api/conversations/[conversationId]/analysis-status/route.ts` (GET, fallback), `app/api/conversations/[conversationId]/understand/route.ts` (GET) | View model: `lib/conversations/server/getUnderstandViewModel.ts`; feedback hook: `lib/conversations/react/useConversationFeedback.ts`; realtime hook: `lib/conversations/react/useConversationAnalysisRealtime.ts` (push-based updates via Supabase Realtime, with polling fallback); polling hook: `lib/conversations/react/useAnalysisStatus.ts` (deprecated, fallback only). See: `docs/realtime-setup.md` | `lib/conversations/react/useConversationFeedback.test.tsx`, `lib/conversations/react/__tests__/useConversationAnalysisRealtime.test.tsx` |
| Vote tab (quadratic voting, decision sessions only) | `app/hives/[hiveId]/conversations/[conversationId]/vote/page.tsx`, `app/components/conversation/VoteView.tsx`, `app/components/conversation/VoteViewContainer.tsx` | `app/api/conversations/[conversationId]/votes/route.ts` (GET/POST) | View model: `lib/conversations/server/getVoteViewModel.ts`; voting service: `lib/conversations/server/voteOnProposal.ts` (calls RPC); fetch votes: `lib/conversations/server/getUserVotes.ts`; RPC function: `vote_on_proposal` (atomic budget enforcement in PostgreSQL, 99 credit budget, cost = votes²); schemas: `lib/conversations/schemas.ts` (voteOnProposalSchema, getVotesResponseSchema); types: `types/conversation-vote.ts` | (add test coverage if changing) |
| Upload CSV responses | `lib/conversations/react/useNewSessionWizard.ts` | `app/api/conversations/[conversationId]/upload/route.ts` (POST) | Importer: `lib/conversations/server/importResponsesFromCsv.ts` | `lib/conversations/server/__tests__/importResponsesFromCsv.test.ts` |
| Trigger analysis | `lib/conversations/react/useNewSessionWizard.ts` | `app/api/conversations/[conversationId]/analyze/route.ts` (POST) | Queueing: `lib/conversations/server/enqueueConversationAnalysis.ts`; worker+pipeline: `scripts/README.md`, `scripts/analysis-worker.ts`, `lib/conversations/server/runConversationAnalysis.ts` | (pipeline is covered via unit tests around domain helpers; add integration tests if you change orchestration) |
| Result/Report tab (view) | `app/hives/[hiveId]/conversations/[conversationId]/result/page.tsx`, `app/components/conversation/ReportView.tsx` | (read via server) | View model: `lib/conversations/server/getReportViewModel.ts`; gating: `lib/conversations/domain/reportRules.ts` | `lib/conversations/domain/__tests__/reportRules.test.ts` |
| Generate report version | (Report UI) | `app/api/conversations/[conversationId]/report/route.ts` (POST) | Gating: `lib/conversations/domain/reportRules.ts`; admin gate: `lib/conversations/server/requireHiveAdmin.ts`; client: `lib/conversations/data/reportClient.ts` | `lib/conversations/domain/__tests__/reportRules.test.ts` |
| Delete conversation | (Hive UI) | `app/api/conversations/[conversationId]/route.ts` (DELETE) | Admin gate: `lib/conversations/server/requireHiveAdmin.ts` | (add `app/tests/api` coverage if changing) |

## Shared Types (Contracts)

- Conversations: `types/conversations.ts`, `types/conversation-understand.ts`, `types/conversation-report.ts`, `types/conversation-vote.ts`
- Hives/members/settings: `types/members.ts`, `types/hive-settings.ts`, plus domain-ish types in `lib/hives/domain/hive.types.ts`
- API: `types/api.ts` (shared API contracts)

## Database Schema

- Migrations: `supabase/migrations/` (latest: `009_remove_public_invite_preview_policy.sql` restores safe invite preview behavior)
- Key additions for invite links:
  - `hive_invite_links` table (one token per hive, 'anyone' or 'invited_only' access modes)
- Key additions for decision sessions (migration 006):
  - `conversations.source_conversation_id` and `conversations.source_report_version` (link to problem space report)
  - `conversation_proposal_votes` table (userId, responseId, votes, quadratic voting)
  - `vote_on_proposal()` RPC function (atomic budget enforcement)
