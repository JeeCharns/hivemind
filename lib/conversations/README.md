# Conversations (Core Domain)

This module owns conversation lifecycle logic: creation, response collection, analysis, and reporting.

## Key Concepts

- Conversation types: `types/conversations.ts` (`"understand" | "decide"`)
  - **Problem Space** (`"understand"`): Traditional conversation flow with Listen → Understand → Result tabs
  - **Solution Space** (`"decide"`): Decision session with Listen → Understand → Vote → Result tabs
- Phases: `types/conversations.ts` (e.g. `listen_open`, `report_open`)
- Analysis status: `types/conversations.ts` (`not_started` → `embedding` → `analyzing` → `ready`)

## Decision Sessions (Solution Space)

Decision sessions (`type: "decide"`) support quadratic voting on proposals and optionally link to a problem space executive summary.

### Key differences from problem space:

1. **Source report linking**: Decision sessions can optionally link to an executive summary from a problem space conversation
   - Fields: `source_conversation_id`, `source_report_version` (nullable)
   - Validated on creation: source must be same hive, type `"understand"`, and version must exist
   - API: `GET /api/hives/[hiveId]/problem-reports` lists available reports
   - API: `GET /api/conversations/[conversationId]/report-preview?version=N` fetches report HTML

2. **Listen tab**: All responses are automatically tagged as `"proposal"` (tag is forced server-side)
   - Validation: `app/api/conversations/[conversationId]/responses/route.ts` overrides client tag input

3. **Understand tab**: Read-only (no feedback actions)
   - Feedback endpoint returns 409 with code `FEEDBACK_DISABLED` for decision sessions
   - UI should hide/disable Agree/Pass/Disagree buttons

4. **Vote tab** (decision sessions only): Quadratic voting interface
   - Each user has 99 credits total
   - Cost formula: `votes²` (1 vote = 1 credit, 2 votes = 4 credits, 3 votes = 9 credits, etc.)
   - Budget enforcement: atomic via PostgreSQL RPC function `vote_on_proposal()`
   - API: `GET /api/conversations/[conversationId]/votes` returns user's current votes
   - API: `POST /api/conversations/[conversationId]/votes` with `{ responseId, delta: 1 | -1 }`
   - Services: `lib/conversations/server/voteOnProposal.ts`, `lib/conversations/server/getUserVotes.ts`
   - View model: `lib/conversations/server/getVoteViewModel.ts`
   - Components: `app/components/conversation/VoteView.tsx`, `VoteViewContainer.tsx`
   - Page: `app/hives/[hiveId]/conversations/[conversationId]/vote/page.tsx`

### Database schema additions:

- Migration: `supabase/migrations/006_add_solution_space_fields.sql`
- `conversations.source_conversation_id` (UUID, nullable, FK to conversations)
- `conversations.source_report_version` (INTEGER, nullable)
- Voting tables (pre-existing, reused):
  - `quadratic_vote_allocations` (conversation_id, proposal_response_id BIGINT, user_id, votes)
  - `quadratic_vote_budgets` (conversation_id, user_id, credits_total, credits_spent)
- RPC function: `vote_on_proposal(p_conversation_id, p_response_id BIGINT, p_user_id, p_delta)`
  - Returns: `{ success, new_votes, remaining_credits, error_code }`
  - Error codes: `BUDGET_EXCEEDED`, `NEGATIVE_VOTES`, `NOT_A_PROPOSAL`, `UNAUTHORIZED_USER`, `NOT_HIVE_MEMBER`, etc.
  - Includes hive membership validation via SECURITY DEFINER

## New Session Flow (Create → Optional CSV → Analysis)

UI entrypoints:

- Wizard UI: `app/components/new-session-wizard.tsx`
- Launcher button/card: `app/components/new-session-launcher.tsx`
- Wizard state/logic: `lib/conversations/react/useNewSessionWizard.ts`

API + services:

1. Create conversation: `app/api/conversations/route.ts` → `lib/conversations/server/createConversation.ts`
2. Optional CSV import: `app/api/conversations/[conversationId]/upload/route.ts` → `lib/conversations/server/importResponsesFromCsv.ts`
3. Trigger analysis: `app/api/conversations/[conversationId]/analyze/route.ts` → `lib/conversations/server/enqueueConversationAnalysis.ts`

Notes:

- CSV imports are limited and validated in `lib/conversations/server/importResponsesFromCsv.ts` (row count, file size, required `response` column).
- Imports are idempotent via `import_batch_id`.
- Analysis runs asynchronously via the worker (`scripts/analysis-worker.ts`).

## Auto-analysis (Understand sessions)

Understand sessions auto-trigger analysis once the conversation reaches **20 responses**.

- Trigger points:
  - After creating a response: `app/api/conversations/[conversationId]/responses/route.ts` → `lib/conversations/server/maybeEnqueueAutoAnalysis.ts`
  - After CSV import completes: `lib/conversations/server/importResponsesFromCsv.ts` → `lib/conversations/server/maybeEnqueueAutoAnalysis.ts`
- Idempotency/concurrency:
  - The active-job unique index prevents duplicate queued/running jobs (`conversation_analysis_jobs`).
  - `maybeEnqueueAutoAnalysis` skips when analysis is already "fresh" (`analysis_status=ready` and `analysis_response_count >= current response count`).
- UI integration (realtime push-based updates):
  - **Primary**: Supabase Realtime subscription via `lib/conversations/react/useConversationAnalysisRealtime.ts`
    - Subscribes to `conversations` table UPDATE events (analysis status changes)
    - Subscribes to `conversation_themes` table INSERT/UPDATE/DELETE events (theme generation)
    - Debounces events (500ms default) to collapse burst updates
    - Returns connection status: `connecting | connected | error | disconnected`
  - **Fallback**: Polling via `lib/conversations/react/useAnalysisStatus.ts` (deprecated)
    - Activated automatically when realtime status is `error`
    - Polls `app/api/conversations/[conversationId]/analysis-status/route.ts` every 5 seconds
  - Fetch understand model: `app/api/conversations/[conversationId]/understand/route.ts`
  - **Setup required**: See `docs/realtime-setup.md` for Supabase Realtime configuration (replication, RLS policies)

## Tabs (Listen / Understand / Vote / Result)

Server components assemble data and render client views:

- Listen: `app/hives/[hiveId]/conversations/[conversationId]/listen/page.tsx` → API feed at `app/api/conversations/[conversationId]/responses/route.ts`
- Understand: `app/hives/[hiveId]/conversations/[conversationId]/understand/page.tsx` → `lib/conversations/server/getUnderstandViewModel.ts`
- Vote (decide only): `app/hives/[hiveId]/conversations/[conversationId]/vote/page.tsx` → `lib/conversations/server/getVoteViewModel.ts`
- Result/Report: `app/hives/[hiveId]/conversations/[conversationId]/result/page.tsx` → `lib/conversations/server/getReportViewModel.ts`

Tab visibility is controlled by conversation type via `app/components/conversation/ConversationHeader.tsx` (`conversationType` prop).

## Tests

- Create conversation API: `app/tests/api/conversations-create.test.ts`
- Responses API + anonymity: `app/tests/api/responses.test.ts`
- CSV import: `lib/conversations/server/__tests__/importResponsesFromCsv.test.ts`
- Wizard hook: `lib/conversations/react/__tests__/useNewSessionWizard.test.tsx`
