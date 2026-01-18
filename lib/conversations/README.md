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

## New Session Flow (Create → Optional CSV → Manual Analysis)

UI entrypoints:

- Wizard UI: `app/components/new-session-wizard.tsx`
- Launcher button/card: `app/components/new-session-launcher.tsx`
- Wizard state/logic: `lib/conversations/react/useNewSessionWizard.ts`

API + services:

1. Create conversation: `app/api/conversations/route.ts` → `lib/conversations/server/createConversation.ts`
2. Optional CSV import: `app/api/conversations/[conversationId]/upload/route.ts` → `lib/conversations/server/importResponsesFromCsv.ts`
3. Admin triggers analysis from Understand tab: `app/api/conversations/[conversationId]/analyze/route.ts` → `lib/conversations/server/triggerConversationAnalysis.ts`

Notes:

- CSV imports are limited and validated in `lib/conversations/server/importResponsesFromCsv.ts` (row count, file size, required `response`/`responses` column; case-insensitive).
- Tags in CSV imports are optional: missing `tag` column, empty tag cells, or unknown/invalid tags result in `null` tags.
- Empty/whitespace-only tags are treated as `null` (no tag).
- Unknown tags (not in the valid set) are treated as `null` (lenient mode - import continues without rejecting the row).
- Imports are idempotent via `import_batch_id`.
- Analysis runs asynchronously via the worker (`scripts/analysis-worker.ts`) after an admin triggers it.

## Clustering Algorithm (Adaptive K-Selection + Minimum Floor)

The analysis pipeline uses k-means clustering with **data-driven k-selection** followed by **post-processing enforcement** of a minimum cluster floor.

### Key Features

- **Knee detection**: Chooses k by finding the maximum perpendicular distance from the distortion curve to the baseline line connecting k=1 and k=max
- **Allows k=1 during auto-selection**: Homogeneous data (identical or near-identical responses) results in a single cluster from the knee detection algorithm
- **Minimum cluster floor (post-processing)**: After knee detection, enforces a minimum cluster count via iterative splits:
  - **n ≤ 40**: Target minimum 3 clusters (when feasible)
  - **n ≥ 41**: Target minimum 5 clusters (when feasible)
  - **Feasibility constraints**: Never exceeds n or floor(n / minForcedClusterSize)
  - **Split policy**: Only splits clusters with size ≥ 2 × minForcedClusterSize (default: 2)
  - **Split method**: k-means with k=2 within the largest eligible cluster
  - **Ordering**: Forced splits occur **before** centroid/distance/outlier computations
  - **Scope**: Applies only to **full analysis runs** (not incremental analysis)
- **Adaptive search range**: maxK derived from data size using configurable minClusterSize (default varies with response count)
- **Diagnostics**: Debug logging available via `ANALYSIS_DEBUG_CLUSTERING=1` env var

### Configuration

**Knee Detection** (Implementation: [lib/analysis/clustering/kmeans.ts](lib/analysis/clustering/kmeans.ts:66)):

- `minClusterSize` (default: adaptive): Minimum meaningful cluster size; used to derive maxK
  - Defaults to 8 (< 100 responses), 12 (≥ 100), 16 (≥ 200), 20 (≥ 400)
- `maxClusters`: Optional override for search budget (capped at data-driven maxK)
- `debug`: Enable detailed logging (defaults to env var)
- Env overrides (useful for quick iteration without code changes):
  - `ANALYSIS_MIN_CLUSTER_SIZE`: Forces the min cluster size used to derive maxK
  - `ANALYSIS_MAX_CLUSTERS`: Caps the maximum k evaluated during knee detection

**Minimum Cluster Floor** (Implementation: [lib/conversations/domain/clusterEnforcement.ts](lib/conversations/domain/clusterEnforcement.ts)):

- `MIN_CLUSTERS_SMALL` (default: 3): Target minimum clusters for n ≤ 40
- `MIN_CLUSTERS_LARGE` (default: 5): Target minimum clusters for n ≥ 41
- `MIN_FORCED_CLUSTER_SIZE` (default: 2): Minimum cluster size required to be eligible for splitting
  - Clusters must have size ≥ 2 × this value to be split
  - Lower values (2) enforce floor more strictly; higher values (3) favor stability

**Thresholds Reference**: [lib/conversations/domain/thresholds.ts](lib/conversations/domain/thresholds.ts)

### Expected Behavior

- **Homogeneous data** (all responses very similar):
  - Knee detection returns k=1
  - Post-processing enforces minimum floor (3 for n ≤ 40, 5 for n ≥ 41 when feasible)
  - Result: May produce artificial splits for UX purposes even with similar responses
- **Small diversity** (~20-50 varied responses):
  - Knee detection returns k=2-5 based on natural groupings
  - Post-processing may force additional splits to reach minimum floor (3 clusters)
  - Result: At least 3 clusters for n ≥ 20 (when feasible)
- **Medium diversity** (~50-100 varied responses):
  - Knee detection returns k=3-8 based on natural groupings
  - Post-processing may force additional splits to reach minimum floor (5 clusters for n ≥ 41)
  - Result: At least 5 clusters for n ≥ 41 (when feasible)
- **High diversity** (~500+ responses):
  - Knee detection returns k=8-25 depending on response variance
  - Post-processing typically no-op (already exceeds minimum floor)
  - Result: Natural cluster count from knee detection
- **No overlap forcing**: Clusters may overlap in 2D visualization; this is expected and reflects embedding space structure
- **Outlier interaction**: Outlier reassignment to MISC_CLUSTER_INDEX occurs after forced splits, so final non-misc cluster count may drop below target (logged as warning)

## Manual Analysis (Understand sessions)

Understand sessions require an **admin** to manually trigger analysis once the conversation reaches **20 responses**.

- Trigger point:
  - Understand tab "Generate" button: `app/components/conversation/UnderstandViewContainer.tsx` → `app/api/conversations/[conversationId]/analyze/route.ts`
- Execution model:
  - **Manual background execution**: Analysis runs immediately when triggered (fire-and-forget pattern)
  - Jobs execute in background via `lib/conversations/server/runAnalysisInBackground.ts`
  - Uses dynamic imports to avoid blocking API responses
  - Optional: External worker (`scripts/analysis-worker.ts`) can handle jobs if auto-execution is disabled
- Idempotency/concurrency:
  - The active-job unique index prevents duplicate queued/running jobs (`conversation_analysis_jobs`).
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

Understand sessions support intelligent re-analysis via the admin-only "Regenerate" button when the analysis is stale (new responses added since last analysis).

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

### Job Retirement (Regenerate Mode and Stale Jobs)

The system handles stuck/stale jobs and explicit regeneration requests:

**Stale Job Detection**:
- **Queued jobs**: Considered stale after 1 hour (likely stuck, no worker available)
- **Running jobs**: Considered stale after 30 minutes (likely crashed worker)
- **Behavior**: Stale jobs are automatically retired when a new analysis is triggered, allowing the new job to proceed
- **Logging**: Retired stale jobs include age in the `last_error` field for diagnostics

**Regenerate Mode**:
- When triggering with `mode: "regenerate"`, non-stale active jobs are also retired (user explicitly wants to restart)
- **Retirement behavior**: Updates job to `status='failed'` with `last_error="superseded by regenerate request"`
- **Worker safety**: Workers check job status before persisting results; if superseded, results are discarded
- **Purpose**: Ensures only the latest regenerate request produces visible results

**Thresholds** (Implementation: [lib/conversations/server/triggerConversationAnalysis.ts](server/triggerConversationAnalysis.ts:139)):
- `STALE_QUEUED_MS = 60 * 60 * 1000` (1 hour)
- `STALE_RUNNING_MS = 30 * 60 * 1000` (30 minutes)

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

### UI Integration (Partial Loading with Granular Progress)

When regenerating analysis, the UI shows partial loading with real-time progress to keep the response list interactive:

- **Initial analysis** (no existing data): Full-page loading state with circular progress indicator showing percentage and status message
- **Regenerate** (existing responses visible):
  - Left column (theme map): Shows loading overlay with circular progress indicator while keeping the old map visible underneath
  - Right column (response list): Remains fully interactive, users can continue voting
  - Regenerate button: Hidden while analysis is in progress
  - Realtime updates: Progress updates in real-time, map refreshes automatically when analysis completes
- **Analysis failure handling**:
  - UI reverts to previous state (last successful analysis) when analysis fails
  - Toast notification appears: "Analysis failed - please ask an admin to regenerate the analysis"
  - Progress indicator is cleared on failure
- **Progress stages**: The pipeline broadcasts granular progress at each stage:
  - 0%: Starting analysis
  - 5%: Fetching responses
  - 10%: Found X responses
  - 15-40%: Generating embeddings
  - 45%: Clustering responses
  - 55%: Generating theme titles
  - 70%: Generating subthemes
  - 80%: Consolidating insights
  - 90%: Updating database
  - 95%: Generating 2D visual map
  - 98%: Making it look pretty
  - 100%: Analysis complete
- **Implementation**:
  - Progress types and broadcast helper: [lib/conversations/server/broadcastAnalysisStatus.ts](server/broadcastAnalysisStatus.ts)
  - Pipeline emits progress: [lib/conversations/server/runConversationAnalysis.ts](server/runConversationAnalysis.ts)
  - Realtime hook handles progress: [lib/conversations/react/useConversationAnalysisRealtime.ts](react/useConversationAnalysisRealtime.ts)
  - Container manages progress state: [app/components/conversation/UnderstandViewContainer.tsx](../../app/components/conversation/UnderstandViewContainer.tsx)
  - View renders progress indicator: [app/components/conversation/UnderstandView.tsx](../../app/components/conversation/UnderstandView.tsx)

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

## Incremental Loading (Understand Tab)

The Understand tab uses incremental loading to optimize initial page load for conversations with many responses.

### How It Works

1. **Initial load**: `getUnderstandViewModel` returns cluster bucket metadata (bucket name, consolidated statement, response count, response IDs) but **not** full response text
2. **Expand on demand**: When user clicks "Show N original responses" on a bucket card, the `useBucketResponses` hook fetches response details
3. **Pagination**: Bucket responses are loaded 20 at a time with "Load more" button for large buckets

### Key Files

- View model: [lib/conversations/server/getUnderstandViewModel.ts](server/getUnderstandViewModel.ts) - Returns `responseIds` array instead of full `responses`
- API endpoint: `app/api/conversations/[conversationId]/buckets/[bucketId]/responses/route.ts` - Paginated bucket responses
- Hook: [lib/conversations/react/useBucketResponses.ts](react/useBucketResponses.ts) - Client-side lazy loading
- Component: `app/components/conversation/ClusterBucketCard.tsx` - Triggers load on expand

### Performance Benefits

- **2000 responses consolidated to 50 buckets**: Initial payload ~50KB (metadata only) vs ~500KB (full responses)
- **5000+ responses**: Significant reduction in initial load time and memory usage
- **User experience**: Voting buttons and aggregate counts work immediately (use response IDs), response text loads on demand

## Tabs (Listen / Understand / Vote / Result)

Server components assemble data and render client views:

- Listen: `app/hives/[hiveId]/conversations/[conversationId]/listen/page.tsx` → API feed at `app/api/conversations/[conversationId]/responses/route.ts`
- Understand: `app/hives/[hiveId]/conversations/[conversationId]/understand/page.tsx` → `lib/conversations/server/getUnderstandViewModel.ts` (with incremental loading for bucket responses)
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
