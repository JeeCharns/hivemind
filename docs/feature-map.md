# Feature Map (Flows → Code)

Use this as a quick index from a product feature to the exact files that implement it.
When adding/changing behavior, prefer updating the `lib/**/server/*` service and its tests, then keep routes/UI thin.

## Auth & Session

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| Login (OTP) | `app/(auth)/login/LoginPageClient.tsx` (2-step: email → OTP entry), `app/(auth)/components/OtpInput.tsx` (6-box code input) | `app/api/auth/session/route.ts` | Auth hook: `app/(auth)/hooks/useAuth.ts` (`sendOtp`, `verifyOtp`); Session: `lib/auth/*` | `app/tests/hooks/useAuth.test.ts`, `app/(auth)/components/__tests__/OtpInput.test.ts` |
| Callback (legacy) | `app/(auth)/callback/page.tsx` | `app/api/auth/session/route.ts` | PKCE code exchange for OAuth/magic link; routes to invite/profile-setup/hives | `lib/auth/server/__tests__/sessionValidation.test.ts` |
| Logout | `app/(auth)/logout/page.tsx` | `app/api/auth/logout/route.ts` | `lib/auth/server/requireAuth.ts` (session) | `app/tests/supabase-auth-cookie.test.ts` |

## Profile Onboarding

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| Profile setup (onboarding) | `app/profile-setup/page.tsx`, `app/profile-setup/ProfileSetupForm.tsx` | `app/api/profile/route.ts` (POST multipart/form-data) | Server services: `lib/profile/server/upsertProfile.ts`, `lib/profile/server/uploadAvatar.ts`; validation: `lib/profile/schemas.ts` (displayName 1-60 chars, avatar <2MB); storage: avatars bucket (configurable via `lib/storage/avatarBucket.ts`) | `app/tests/api/profile.test.ts`, `lib/profile/server/__tests__/upsertProfile.test.ts` |
| Check profile status | `app/(auth)/callback/page.tsx` (routes to /profile-setup if needed) | `app/api/profile/status/route.ts` (GET) | Server service: `lib/profile/server/getProfileStatus.ts`; returns `{ hasProfile, needsSetup }`; also triggers idempotent auto-join to Welcome Hive via `lib/hives/server/joinWelcomeHive.ts` | `app/tests/api/profile.test.ts`, `lib/hives/server/__tests__/joinWelcomeHive.test.ts` |
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
| Create hive (2-step wizard) | Entry: `app/hives/HivesHome.tsx` → `/hives/new`; Wizard: `app/hives/new/page.tsx`, `app/hives/new/new-hive-wizard.tsx` (Step 1: name+logo+visibility→create, Step 2: share link via HiveShareInvitePanel linkOnly mode) | `app/api/hives/route.ts` (POST create with visibility), `app/api/hives/[hiveId]/share-link/route.ts` (GET share link) | Create service: `lib/hives/server/createHive.ts` (accepts visibility); Share panel: `app/hives/components/HiveShareInvitePanel.tsx` (linkOnly prop); validation: `lib/hives/schemas.ts` (hiveVisibilitySchema); Visibility: public hives searchable/joinable, private hives require invite link; See: `docs/specs/create-hive-wizard.md` | `app/tests/api/hives-create.test.ts` |
| Search hives | `app/hives/components/JoinHiveSearch.tsx` | `app/api/hives/search/route.ts` (GET) | Server service: `lib/hives/server/searchJoinableHives.ts`; validation: Zod schema in route (term 1-80 chars, limit 1-10) | `app/tests/api/hives-search.test.ts` |
| Join a hive | `app/hives/components/JoinHiveSearch.tsx` | `app/api/hives/[hiveId]/join/route.ts` (POST) | Server service: `lib/hives/server/joinHive.ts` (idempotent upsert); validation: Zod UUID check | `app/tests/api/hives-join.test.ts` |
| Hive details + conversations | `app/hives/[hiveId]/page.tsx` | `app/api/hives/[hiveId]/route.ts` (GET) | Hive resolution: `lib/hives/data/hiveResolver.ts`; conversations list: `lib/conversations/server/listHiveConversations.ts` | (see conversation tests below) |
| Hive stats | `app/hives/[hiveId]/page.tsx` (passes counts to `HiveHome`) | `app/api/hives/[hiveId]/stats/route.ts` (available for client use) | (route is currently the logic) | (add `app/tests/api` coverage if changing) |
| Hive settings (view) | `app/hives/[hiveId]/settings/page.tsx` | `app/api/hives/[hiveId]/route.ts` (GET) | View model + authz: `lib/hives/server/getHiveSettings.ts` | `lib/hives/server/authorizeHiveAdmin.test.ts` |
| Hive settings (update) | `app/hives/[hiveId]/settings/SettingsClient.tsx` | `app/api/hives/[hiveId]/route.ts` (PATCH) | Validation: `lib/hives/data/hiveSchemas.ts` | `lib/hives/server/authorizeHiveAdmin.test.ts` |
| Members list | `app/hives/[hiveId]/members/page.tsx` | (none; server fetch) | `lib/members/server/getMembersWithSignedUrls.ts` | `lib/members/validation/memberValidation.test.ts` |
| Invite/Share hive | Server page: `app/hives/[hiveId]/invite/page.tsx` (server-first auth, membership gating, passes isAdmin); Client: `app/hives/[hiveId]/invite/InviteShareClient.tsx`; Reuses: `app/hives/components/HiveShareInvitePanel.tsx` (same as Conversation Share modal) | `app/api/hives/[hiveId]/share-link/route.ts` (GET/PATCH), `app/api/hives/[hiveId]/invite/route.ts` (POST for invited_only whitelist) | Server auth: `lib/hives/server/authorizeHiveAdmin.ts`, `lib/navbar/data/hiveRepository.ts` (checkHiveMembership); Server service: `lib/hives/server/shareLinkService.ts`; two access modes: 'anyone' (any user with link), 'invited_only' (only whitelisted emails can join); See: `docs/specs/hive-share-invite-links.md` | (add `app/tests/api` coverage if changing) |
| Share hive via Conversation modal | Entry: Conversation "Share" button (`app/components/conversation/ConversationHeader.tsx`); Modal: `app/hives/components/HiveShareInvitePanel.tsx` | (same APIs as Invite/Share hive above) | (same logic as Invite/Share hive above) | (add `app/tests/api` coverage if changing) |
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
| Listen tab (render + compose) | `app/hives/[hiveId]/conversations/[conversationId]/listen/page.tsx`, `app/components/conversation/ListenView.tsx` | `app/api/conversations/[conversationId]/responses/route.ts` (GET/POST; for decision sessions, tag is forced to "proposal"; for understand sessions, tags are optional; broadcasts complete LiveResponse to feed channel after insert) | Membership gate: `lib/conversations/server/requireHiveMember.ts`; tags: `lib/conversations/domain/tags.ts` (optional for understand sessions - empty/whitespace tags treated as null); feed hook: `lib/conversations/react/useConversationFeed.ts`; realtime hook: `lib/conversations/react/useConversationFeedRealtime.ts` (broadcast channel for instant updates, postgres_changes for likes); broadcast service: `lib/conversations/server/broadcastResponse.ts`; See: `docs/realtime-setup.md` (Live Feed Broadcast Channel section) | `app/tests/api/responses.test.ts`, `lib/conversations/react/useConversationFeed.test.tsx`, `lib/conversations/react/__tests__/useConversationFeedRealtime.test.tsx` |
| Like a response | (Listen UI) | `app/api/responses/[responseId]/like/route.ts` (POST/DELETE) | Client: `lib/conversations/data/likesClient.ts` | (add `app/tests/api` coverage if changing) |
| Understand tab (themes + feedback) | `app/hives/[hiveId]/conversations/[conversationId]/understand/page.tsx`, `app/components/conversation/UnderstandViewContainer.tsx`, `app/components/conversation/UnderstandView.tsx` | `app/api/conversations/[conversationId]/feedback/route.ts` (POST; supports toggle-off - clicking the same vote withdraws it; returns 409 FEEDBACK_DISABLED for decision sessions), `app/api/conversations/[conversationId]/analysis-status/route.ts` (GET, fallback), `app/api/conversations/[conversationId]/understand/route.ts` (GET), `app/api/conversations/[conversationId]/buckets/[bucketId]/responses/route.ts` (GET; incremental loading of bucket responses with pagination) | View model: `lib/conversations/server/getUnderstandViewModel.ts` (returns bucket metadata without full responses for incremental loading); feedback hook: `lib/conversations/react/useConversationFeedback.ts` (optimistic updates with toggle-off support); bucket responses hook: `lib/conversations/react/useBucketResponses.ts` (lazy-loads responses when bucket is expanded); UI: voted buttons change color (green/red/darker grey) and other buttons become disabled; clicking active button withdraws vote; realtime hook: `lib/conversations/react/useConversationAnalysisRealtime.ts` (push-based updates via Supabase Realtime, with polling fallback); polling hook: `lib/conversations/react/useAnalysisStatus.ts` (deprecated, fallback only). See: `docs/realtime-setup.md` | `lib/conversations/react/useConversationFeedback.test.tsx`, `lib/conversations/react/__tests__/useConversationAnalysisRealtime.test.tsx`, `app/tests/api/feedback.test.ts` |
| Vote tab (quadratic voting, decision sessions only) | `app/hives/[hiveId]/conversations/[conversationId]/vote/page.tsx`, `app/components/conversation/VoteView.tsx`, `app/components/conversation/VoteViewContainer.tsx` | `app/api/conversations/[conversationId]/votes/route.ts` (GET/POST) | View model: `lib/conversations/server/getVoteViewModel.ts`; voting service: `lib/conversations/server/voteOnProposal.ts` (calls RPC); fetch votes: `lib/conversations/server/getUserVotes.ts`; RPC function: `vote_on_proposal` (atomic budget enforcement in PostgreSQL, 99 credit budget, cost = votes²); schemas: `lib/conversations/schemas.ts` (voteOnProposalSchema, getVotesResponseSchema); types: `types/conversation-vote.ts` | (add test coverage if changing) |
| Upload CSV responses | `lib/conversations/react/useNewSessionWizard.ts` | `app/api/conversations/[conversationId]/upload/route.ts` (POST) | Importer: `lib/conversations/server/importResponsesFromCsv.ts` (tags are optional: missing tag column or empty/whitespace tag cells result in null tags) | `lib/conversations/server/__tests__/importResponsesFromCsv.test.ts` |
| Trigger analysis (initial, admin) | Understand tab "Generate" banner (`app/components/conversation/UnderstandViewContainer.tsx`) | `app/api/conversations/[conversationId]/analyze/route.ts` (POST, body: `{mode: "manual", strategy: "auto"}`) | Queueing: `lib/conversations/server/triggerConversationAnalysis.ts`; worker+pipeline: `scripts/README.md`, `scripts/analysis-worker.ts`, `lib/conversations/server/runConversationAnalysis.ts`; clustering: `lib/analysis/clustering/kmeans.ts` (adaptive k-selection via knee detection; k is emergent from data, no hard floor/cap) | (pipeline is covered via unit tests around domain helpers; add integration tests if you change orchestration) |
| Regenerate analysis (incremental/full, admin) | Understand tab "Regenerate" button (hidden while analysis in progress) | `app/api/conversations/[conversationId]/analyze/route.ts` (POST, body: `{mode: "regenerate", strategy: "auto"}`) | Strategy decision: `lib/conversations/server/triggerConversationAnalysis.ts` (retires active jobs before enqueue in regenerate mode; decides incremental vs full based on staleness); worker safety: `lib/conversations/server/runAnalysisInBackground.ts` (checks job status before persisting); incremental pipeline: `lib/conversations/server/runConversationAnalysisIncremental.ts`; full pipeline: `lib/conversations/server/runConversationAnalysis.ts`; worker: `scripts/analysis-worker.ts`; threshold: < 10 new → incremental, ≥ 10 new → full; UI: partial loading (left column overlay, right column interactive); schemas: `lib/conversations/schemas.ts` (triggerAnalysisRequestSchema, triggerAnalysisResponseSchema) | `lib/conversations/server/__tests__/triggerConversationAnalysis.test.ts`, `app/tests/components/UnderstandViewContainer.test.tsx` |
| Result/Report tab (view) | `app/hives/[hiveId]/conversations/[conversationId]/result/page.tsx`, `app/components/conversation/ReportView.tsx` | (read via server) | View model: `lib/conversations/server/getReportViewModel.ts`; gating: `lib/conversations/domain/reportRules.ts` | `lib/conversations/domain/__tests__/reportRules.test.ts` |
| Generate report version | (Report UI) | `app/api/conversations/[conversationId]/report/route.ts` (POST) | Gating: `lib/conversations/domain/reportRules.ts`; admin gate: `lib/conversations/server/requireHiveAdmin.ts`; client: `lib/conversations/data/reportClient.ts` | `lib/conversations/domain/__tests__/reportRules.test.ts` |
| Delete conversation | (Hive UI) | `app/api/conversations/[conversationId]/route.ts` (DELETE) | Admin gate: `lib/conversations/server/requireHiveAdmin.ts` | (add `app/tests/api` coverage if changing) |

## Shared Types (Contracts)

- Conversations: `types/conversations.ts`, `types/conversation-understand.ts`, `types/conversation-report.ts`, `types/conversation-vote.ts`
- Hives/members/settings: `types/members.ts`, `types/hive-settings.ts`, plus domain-ish types in `lib/hives/domain/hive.types.ts`
- API: `types/api.ts` (shared API contracts)

## Welcome Hive

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| Auto-join on signup | (automatic during profile status check) | `app/api/profile/status/route.ts` (GET triggers auto-join) | Service: `lib/hives/server/joinWelcomeHive.ts` (idempotent join to system hive) | `lib/hives/server/__tests__/joinWelcomeHive.test.ts` |
| Welcome Hive homepage | `app/hives/[hiveId]/page.tsx` (system hive variant with sidebar) | `app/api/hives/[hiveId]/activity/route.ts`, `app/api/hives/[hiveId]/reactions/route.ts`, `app/api/hives/[hiveId]/presence/route.ts` | Activity service: `lib/activity/server/activityService.ts`; Reactions service: `lib/reactions/server/reactionsService.ts`; Hooks: `lib/activity/react/useActivityFeed.ts`, `lib/reactions/react/useReactions.ts`, `lib/presence/react/usePresence.ts` | (add test coverage if changing) |
| Multi-step conversation cards | `app/components/conversation/ConversationCard.tsx` (shows phase progress indicator) | (n/a) | Phase display: `lib/conversations/domain/conversationPhase.ts` | (add test coverage if changing) |
| Social sidebar | `app/hives/components/WelcomeHiveSidebar.tsx` (activity feed, reactions, presence) | (same APIs as homepage) | (same logic as homepage) | (add test coverage if changing) |
| Create Hive CTA | `app/hives/components/CreateHiveCTA.tsx` (prominent call-to-action in sidebar) | (navigates to `/hives/new`) | (n/a) | (n/a) |

## Decision Space

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| Fetch setup data (clusters + statements) | Decision Setup Wizard | `app/api/decision-space/setup/route.ts` (GET ?sourceConversationId=) | Service: `lib/decision-space/server/getDecisionSetupData.ts`; validation: `lib/decision-space/schemas.ts` (getDecisionSetupDataSchema) | (add test coverage if changing) |
| Create decision session | Decision Setup Wizard | `app/api/decision-space/route.ts` (POST) | Service: `lib/decision-space/server/createDecisionSession.ts`; validation: `lib/decision-space/schemas.ts` (createDecisionSessionSchema); requires hive admin role | `lib/decision-space/server/__tests__/createDecisionSession.test.ts` |
| Cast quadratic vote on proposal | Vote Tab UI | `app/api/decision-space/[conversationId]/vote/route.ts` (POST) | Service: `lib/decision-space/server/voteOnDecisionProposal.ts`; validation: `lib/decision-space/schemas.ts` (voteOnProposalSchema); RPC: `vote_on_decision_proposal` | `lib/decision-space/server/__tests__/voteOnDecisionProposal.test.ts` |
| Close voting round | Admin action | `app/api/decision-space/[conversationId]/rounds/[roundId]/close/route.ts` (POST) | Service: `lib/decision-space/server/closeDecisionRound.ts`; triggers: `lib/decision-space/server/generateDecisionResults.ts`; requires hive admin role | (add test coverage if changing) |
| Decision session tabs (Listen/Vote/Results) | `app/hives/[hiveId]/conversations/[conversationId]/decide/page.tsx`, `app/components/conversation/DecisionView.tsx`, `app/components/conversation/DecisionViewContainer.tsx` | `app/api/decision-space/[conversationId]/vote/route.ts` (POST) | View model: `lib/decision-space/server/getDecisionViewModel.ts`; components: DecisionView (3-tab UI), DecisionViewContainer (API wrapper); types: `types/decision-space.ts` | (add test coverage if changing) |

## Notifications

| Flow | UI entry | API | Core logic | Tests |
| --- | --- | --- | --- | --- |
| In-app notifications (real-time) | `app/components/navbar/NotificationBell.tsx`, `app/components/navbar/NotificationDropdown.tsx` | `app/api/notifications/route.ts` (GET/DELETE), `app/api/notifications/read/route.ts` (PATCH) | Hook: `lib/notifications/hooks/useNotifications.ts` (Supabase Realtime, postgres_changes); service: `lib/notifications/server/notificationService.ts` | (add test coverage if changing) |
| Email notification preferences | `app/settings/AccountSettingsForm.tsx` (NotificationPreferencesSection) | `app/api/profile/notifications/route.ts` (GET/PATCH) | Hook: `lib/notifications/hooks/useNotificationPreferences.ts`; service: `lib/notifications/server/notificationService.ts` | (add test coverage if changing) |
| Send notification emails | (internal, called by triggers) | `app/api/notifications/email/route.ts` (POST, internal) | Email service: `lib/notifications/server/emailService.ts` (Nodemailer + Zoho SMTP) | (add test coverage if changing) |
| Notification triggers | (automatic on events) | (n/a) | Database triggers: `supabase/migrations/039_create_notifications.sql` (new_conversation, analysis_complete, report_generated, opinion_liked) | (add test coverage if changing) |

## Database Schema

- Migrations: `supabase/migrations/` (latest: `039_create_notifications.sql` adds user_notifications table and triggers)
- Key additions for invite links:
  - `hive_invite_links` table (one token per hive, 'anyone' or 'invited_only' access modes)
- Key additions for decision sessions (migration 006):
  - `conversations.source_conversation_id` and `conversations.source_report_version` (link to problem space report)
  - `conversation_proposal_votes` table (userId, responseId, votes, quadratic voting)
  - `vote_on_proposal()` RPC function (atomic budget enforcement)
- Key additions for decision space (migration 010):
  - `decision_proposals` table (proposals from selected statements)
  - `decision_rounds` table (voting rounds with status and visibility)
  - `decision_votes` table (quadratic votes with credit tracking)
  - `decision_results` table (round outcomes with AI-generated analysis)
  - `vote_on_decision_proposal()` RPC function (atomic budget enforcement for decision voting)
