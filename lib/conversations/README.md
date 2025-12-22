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
   - For problem space (`"understand"`), tags are optional: responses without tags display with no tag UI

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

- CSV imports are limited and validated in `lib/conversations/server/importResponsesFromCsv.ts` (row count, file size, required `response`/`responses` column; case-insensitive).
- Tags in CSV imports are optional: missing `tag` column, empty tag cells, or unknown/invalid tags result in `null` tags.
- Empty/whitespace-only tags are treated as `null` (no tag).
- Unknown tags (not in the valid set) are treated as `null` (lenient mode - import continues without rejecting the row).
- Imports are idempotent via `import_batch_id`.
- Analysis runs asynchronously via the worker (`scripts/analysis-worker.ts`).

## Clustering Algorithm (Adaptive K-Selection)

The analysis pipeline uses k-means clustering with **data-driven k-selection** (no hard-coded minimum or maximum k).

### Key Features

- **Knee detection**: Chooses k by finding the maximum perpendicular distance from the distortion curve to the baseline line connecting k=1 and k=max
- **Allows k=1**: Homogeneous data (identical or near-identical responses) results in a single cluster
- **No forced floor/cap**: Previous hard constraints (k >= 2, k <= 6) removed; k is purely emergent from data
- **Adaptive search range**: maxK derived from data size using configurable minClusterSize (default varies with response count)
- **Diagnostics**: Debug logging available via `ANALYSIS_DEBUG_CLUSTERING=1` env var

### Configuration

Implementation: [lib/analysis/clustering/kmeans.ts](lib/analysis/clustering/kmeans.ts:66)

- `minClusterSize` (default: adaptive): Minimum meaningful cluster size; used to derive maxK
  - Defaults to 8 (< 100 responses), 12 (≥ 100), 16 (≥ 200), 20 (≥ 400)
- `maxClusters`: Optional override for search budget (capped at data-driven maxK)
- `debug`: Enable detailed logging (defaults to env var)
- Env overrides (useful for quick iteration without code changes):
  - `ANALYSIS_MIN_CLUSTER_SIZE`: Forces the min cluster size used to derive maxK
  - `ANALYSIS_MAX_CLUSTERS`: Caps the maximum k evaluated during knee detection

### Expected Behavior

- **Homogeneous data** (all responses very similar): k=1
- **Small diversity** (~20-50 varied responses): k=2-5 based on natural groupings
- **High diversity** (~500+ responses): k selected via knee detection, typically 8-25 depending on response variance
- **No overlap forcing**: Clusters may overlap in 2D visualization; this is expected and reflects embedding space structure

## Auto-analysis (Understand sessions)

Understand sessions auto-trigger analysis once the conversation reaches **20 responses**.

- Trigger points:
  - After creating a response: `app/api/conversations/[conversationId]/responses/route.ts` → `lib/conversations/server/maybeEnqueueAutoAnalysis.ts`
  - After CSV import completes: `lib/conversations/server/importResponsesFromCsv.ts` → `lib/conversations/server/maybeEnqueueAutoAnalysis.ts`
- Execution model:
  - **Automatic background execution**: Analysis runs immediately when triggered (fire-and-forget pattern)
  - Jobs execute in background via `lib/conversations/server/runAnalysisInBackground.ts`
  - Uses dynamic imports to avoid blocking API responses
  - Optional: External worker (`scripts/analysis-worker.ts`) can handle jobs if auto-execution is disabled
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

## Regenerate Analysis (Incremental vs Full)

Understand sessions support intelligent re-analysis via the "Regenerate" button when the analysis is stale (new responses added since last analysis).

### Strategy Selection

The system automatically chooses between incremental and full re-analysis:

- **Incremental** (< 10 new responses + prerequisites exist):
  - Only processes new responses since last analysis
  - Assigns new responses to existing clusters using nearest centroid (cosine distance in embedding space)
  - Places new points on existing 2D map using cluster centroids + deterministic jitter
  - Updates cluster sizes without regenerating themes
  - Preserves stable UX: existing responses keep their positions and cluster assignments
  - Prerequisites: `conversation_cluster_models` table has persisted cluster centroids from last full run

- **Full** (≥ 10 new responses OR missing prerequisites):
  - Re-runs complete pipeline: embeddings → 2D map → clustering → themes
  - Recomputes all cluster assignments and coordinates
  - Regenerates theme names and descriptions
  - Persists cluster models for future incremental updates

### API

- Endpoint: `POST /api/conversations/[conversationId]/analyze`
- Request body (optional):
  - `mode`: `"manual"` (default) or `"regenerate"`
  - `strategy`: `"auto"` (default), `"incremental"`, or `"full"`
- Response includes:
  - `status`: `"queued"`, `"already_running"`, or `"already_complete"`
  - `strategy`: `"incremental"` or `"full"` (when queued)
  - `reason`: `"fresh"`, `"stale"`, `"in_progress"`, `"below_threshold"`, `"wrong_type"`, `"missing_prereqs"`
  - Staleness metadata: `currentResponseCount`, `analysisResponseCount`, `newResponsesSinceAnalysis`

### Services

- Strategy decision + enqueue: `lib/conversations/server/triggerConversationAnalysis.ts`
- Background execution (fire-and-forget): `lib/conversations/server/runAnalysisInBackground.ts`
- Full analysis pipeline: `lib/conversations/server/runConversationAnalysis.ts` (persists cluster models)
- Incremental analysis pipeline: `lib/conversations/server/runConversationAnalysisIncremental.ts`
- Optional external worker: `scripts/analysis-worker.ts` (branches on `strategy` field from job queue)

### Database Schema

- Migration: `supabase/migrations/010_add_incremental_analysis_support.sql`
- `conversations.analysis_response_count`: tracks baseline for staleness detection
- `conversations.analysis_updated_at`: timestamp of last successful analysis
- `conversation_analysis_jobs.strategy`: `"incremental"` or `"full"` (default: `"full"`)
- `conversation_cluster_models`: persisted cluster centroids and stats for incremental updates
  - `centroid_embedding`: cluster centroid in embedding space (float4[])
  - `centroid_x_umap`, `centroid_y_umap`: cluster centroid in 2D UMAP space
  - `spread_radius`: cluster spread radius for jitter placement

### View Model

- `UnderstandViewModel` includes staleness metadata:
  - `analysisResponseCount`: baseline response count from last analysis
  - `analysisUpdatedAt`: timestamp of last analysis
  - `newResponsesSinceAnalysis`: count of new responses since last analysis
  - `isAnalysisStale`: boolean indicating if analysis is out of date

## Tabs (Listen / Understand / Vote / Result)

Server components assemble data and render client views:

- Listen: `app/hives/[hiveId]/conversations/[conversationId]/listen/page.tsx` → API feed at `app/api/conversations/[conversationId]/responses/route.ts`
- Understand: `app/hives/[hiveId]/conversations/[conversationId]/understand/page.tsx` → `lib/conversations/server/getUnderstandViewModel.ts`
- Vote (decide only): `app/hives/[hiveId]/conversations/[conversationId]/vote/page.tsx` → `lib/conversations/server/getVoteViewModel.ts`
- Result/Report: `app/hives/[hiveId]/conversations/[conversationId]/result/page.tsx` → `lib/conversations/server/getReportViewModel.ts`

Tab visibility is controlled by conversation type via `app/components/conversation/ConversationHeader.tsx` (`conversationType` prop).

### Report Generation Requirements

Report generation (Result tab) requires:

1. **Minimum responses**: 20 responses (same threshold as Understand tab analysis)
2. **Admin access**: Only hive admins can trigger report generation
3. **Analysis ready**: Conversation analysis must be completed (`analysis_status === "ready"`)
4. **Correct type**: Only `"understand"` conversations support reports

Thresholds are centralized in `lib/conversations/domain/thresholds.ts` to prevent drift:
- `UNDERSTAND_MIN_RESPONSES = 20` (Understand tab gating and analysis triggering)
- `REPORT_MIN_RESPONSES = 20` (Report tab gating and generation)
- `INCREMENTAL_THRESHOLD = 10` (Incremental vs full analysis strategy)

Report generation API:
- Endpoint: `POST /api/conversations/[conversationId]/report`
- Service: `lib/conversations/server/getReportViewModel.ts`
- Gating logic: `lib/conversations/domain/reportRules.ts` (`canOpenReport`, `canGenerateReport`)
- UI component: `app/components/conversation/ReportView.tsx`

## Tests

- Create conversation API: `app/tests/api/conversations-create.test.ts`
- Responses API + anonymity: `app/tests/api/responses.test.ts`
- CSV import: `lib/conversations/server/__tests__/importResponsesFromCsv.test.ts`
- Wizard hook: `lib/conversations/react/__tests__/useNewSessionWizard.test.tsx`
