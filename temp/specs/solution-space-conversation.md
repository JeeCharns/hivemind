# Solution Space Conversations (Make a Decision) — Spec

## Summary

Add a new “Solution Space” conversation experience that renders when users choose **Make a Decision** in the New Session flow (conversation `type: "decide"`). The solution space experience reuses the existing conversation shell and most of Listen/Understand/Report behaviors, with the following key differences:

- New Session setup optionally links an existing **Problem Space** (conversation `type: "understand"`) **executive summary report** to the decision session (instead of CSV import).
- Listen tab:
  - Optionally shows the selected executive summary report at the top of the left column.
  - Response submission has **no tag selector**; all submissions are tagged as **`proposal`**.
  - Live feed stays the same.
- Understand tab:
  - Same visualization and list, but **no Agree/Pass/Disagree** actions (read-only).
- New Vote tab:
  - Quadratic Voting: each user has **99 credits**, can allocate votes to proposals; cost is `votes^2`.
- Report tab:
  - Remains the same UI surface as Problem Space conversations.

This spec focuses on clean layering per `CLAUDE.md`: thin routes, Zod validation at boundaries, business logic in `lib/**/server/*`, and shared contracts in `types/*`.

## Goals

- Support `type: "decide"` sessions with Solution Space tabs: Listen → Understand → Vote → Result.
- Allow optionally selecting an executive summary report from an existing `type: "understand"` conversation in the same hive at session creation time.
- Enforce that solution-space Listen submissions are always tagged as `proposal`.
- Make Understand read-only for decide sessions (no response feedback writes).
- Implement quadratic voting with server-enforced budget and stable API error shapes.

## Non-goals (for initial release)

- Changing the analysis pipeline, clustering, or report generation prompt logic.
- Migrating existing conversations to have linked reports retroactively (optional backfill can come later).
- Designing a brand new report format for decisions (see “Open questions”).

## User Experience

### New Session Wizard changes

Entry points: `app/components/new-session-wizard.tsx`, `lib/conversations/react/useNewSessionWizard.ts`.

**Step 1 (unchanged):** Choose session type + title + description.

**Step 2 (branch on type):**

- If `type === "understand"`: keep existing CSV import UI and behavior.
- If `type === "decide"`:
  - Replace CSV import with “Optional: select executive summary from a prior Problem Space session”.
  - Show a list of eligible conversations (same hive) that have at least one report version in `conversation_reports`.
  - Allow:
    - “Continue without report” (creates decision session with no linked report)
    - “Select a report” (pick conversation, optionally pick version; see Data Model)
  - If a conversation is selected, show a preview (title, created time, and a safe-rendered snippet/summary).

### Conversation tabs

Conversation chrome uses `app/components/conversation/ConversationHeader.tsx`.

Tabs depend on conversation type:

- **Problem Space** (`type: "understand"`): Listen, Understand, Result (current behavior).
- **Solution Space** (`type: "decide"`): Listen, Understand, Vote, Result.

### Solution Space: Listen tab

Base component: `app/components/conversation/ListenView.tsx` (or a sibling `SolutionListenView`).

Differences:

1. Report preview (optional):
   - If decision session has a linked report, render it at the top of the left column (above the composer).
   - Render HTML safely (same approach as Report tab uses) and style as a compact “context card”.
2. Composer:
   - Remove tag chips entirely.
   - All submissions are sent with `tag: "proposal"`.
   - UI copy reflects proposals (e.g. placeholder: “Propose an option…”).
3. Feed:
   - Remains identical; items show their tag badge (always “Proposal” for newly submitted ones).

### Solution Space: Understand tab (read-only)

Base: `app/components/conversation/UnderstandViewContainer.tsx` / `app/components/conversation/UnderstandView.tsx`.

Differences:

- Hide or disable the feedback action buttons (Agree/Pass/Disagree).
- Do not call `POST /api/conversations/[conversationId]/feedback` in this mode.
- Optionally still display aggregate counts, but keep them read-only.

### Vote tab (Quadratic Voting)

New UI: `app/components/conversation/VoteView.tsx` (client component), server page: `app/hives/[hiveId]/conversations/[conversationId]/vote/page.tsx`.

Behavior:

- Each proposal is a conversation response with `tag === "proposal"`.
- Each user has a budget of **99 credits**.
- Allocating `n` votes to a proposal costs `n^2` credits.
- UI shows:
  - Remaining credits
  - Reset button (resets local state; server needs an explicit reset endpoint if we want persistence reset)
  - For each proposal: +/- controls, current vote count, “Next vote cost”, and total credits spent on that proposal.

UI source: replicate the structure from the provided `PhaseVote` code for Solution Space (wallet header + cards grid + per-proposal controls), adapted to repo primitives (`app/components/button.tsx` and icons already used in the app).

## Data Model

### Link decision sessions to a source report

Add fields to `conversations` (migration required):

- `source_conversation_id uuid null` — the Problem Space conversation that produced the report.
- `source_report_version int null` — optional; pins a specific report version for stability.

Constraints:

- `source_conversation_id` must reference an existing conversation in the same hive and `type = "understand"`.
- If `source_report_version` is set, it must exist in `conversation_reports` for that conversation.

Note: enforce these constraints in server logic first (and optionally with DB constraints later). Start with application-level validation for flexibility.

### Quadratic voting storage

Add a table for per-user proposal votes (migration required):

`conversation_proposal_votes`
- `conversation_id uuid not null` (decision session)
- `response_id uuid not null` (proposal response)
- `user_id uuid not null`
- `votes int not null default 0` (non-negative)
- `updated_at timestamptz not null default now()`

Indexes/constraints:

- Primary key `(conversation_id, response_id, user_id)` or unique constraint.
- Foreign keys:
  - `conversation_id → conversations.id`
  - `response_id → conversation_responses.id`
- Check constraint `votes >= 0`.

Derived values:

- Per-user spend in a conversation is computed as `SUM(votes^2)` across responses.

## API Design (Zod-validated)

All new routes validate input with Zod and return stable `{ error, code? }` on failure via `lib/api/errors.ts`.

### 1) List eligible Problem Space reports for a hive

`GET /api/hives/[hiveId]/problem-reports`

Purpose: used by the decision-session wizard step 2 to list selectable reports.

Response shape (suggested):

```ts
type ProblemReportListItem = {
  conversationId: string;
  conversationSlug: string | null;
  title: string | null;
  latestReportVersion: number;
  latestReportCreatedAt: string | null;
};
```

Implementation notes:

- Auth: session required (`requireAuth()` / `getServerSession()`).
- Authz: hive membership required (`requireHiveMember`).
- Query:
  - conversations in hive where `type = "understand"`
  - join `conversation_reports` and select max(version) per conversation
- Do not return full HTML by default (keep list light). Fetch HTML lazily when a user selects an item.

### 2) Fetch a specific report version (or latest) for preview

Option A (recommended):

`GET /api/conversations/[conversationId]/report-preview?version=number`

Response:

```ts
{ version: number; html: string; createdAt: string | null }
```

Authz: membership in the hive of that conversation.

### 3) Create conversation (extend existing)

Extend `POST /api/conversations` (schemas: `lib/conversations/schemas.ts`):

- Add optional fields only allowed for `type === "decide"`:
  - `sourceConversationId?: uuid`
  - `sourceReportVersion?: int`

Server: `lib/conversations/server/createConversation.ts`

- Validate membership (existing).
- If `type === "decide"` and source fields are present:
  - Verify `sourceConversationId` exists, belongs to same hive, and is `type === "understand"`.
  - If `sourceReportVersion` present, verify that version exists.
- Insert new conversation with `phase: "listen_open"` and store source fields.

### 4) Submit response (force proposal tag)

Existing: `POST /api/conversations/[conversationId]/responses`

Decision sessions should force proposals:

- In the UI: always send `tag: "proposal"`.
- In the API: enforce for `type === "decide"` to prevent spoofing:
  - Ignore/override incoming `tag` and persist `proposal`.

### 5) Disable feedback writes for decision sessions

Existing: `POST /api/conversations/[conversationId]/feedback`

Change:

- Fetch conversation type; if `type === "decide"`, return `409` (or `403`) with `{ error, code }` like:
  - `{ error: "Feedback is disabled for decision sessions", code: "FEEDBACK_DISABLED" }`.

### 6) Vote endpoints

`GET /api/conversations/[conversationId]/votes`

- Returns the current user’s votes per proposal response id + derived totals (spent/remaining).
- Auth: required.
- Authz: hive membership.

`POST /api/conversations/[conversationId]/votes`

Body:

```ts
{ responseId: string; delta: 1 | -1 }
```

Server rules:

- Conversation must be `type === "decide"`.
- Target response must belong to the conversation and have tag `proposal`.
- Votes never go below 0.
- Enforce budget 99 credits:
  - Current spend: `SUM(v^2)` for the user in the conversation.
  - Proposed change: compute `newCost = (v+delta)^2 - v^2`.
  - Reject if `currentSpend + newCost > 99`.

Concurrency/atomicity:

- Prefer implementing budget enforcement in the database via an RPC function (Postgres `SECURITY DEFINER`) to prevent race conditions.
- If implemented in app code, document race risk and mitigate with row-level locks (harder with Supabase JS).

Error status codes:

- 400 for invalid body
- 403 for not a hive member
- 404 for missing conversation/response
- 409 for budget exceeded or invalid state

## Routing & Server Components

Add Vote route:

- `app/hives/[hiveId]/conversations/[conversationId]/vote/page.tsx`
  - Auth + membership like other tabs
  - Fetch proposal list (responses tagged `proposal`)
  - Fetch user’s current votes
  - Render `<VoteView ... />`

Update header tabs:

- Pass `conversation.type` to `ConversationHeader` via `app/hives/[hiveId]/conversations/[conversationId]/layout.tsx`.
- Update `app/components/conversation/ConversationHeader.tsx` to render tab set based on type.

Update Listen/Understand pages:

- `listen/page.tsx`: fetch conversation type; render `ListenView` in either:
  - `mode="problem" | "solution"` or
  - separate components for clarity (`ListenView` vs `SolutionListenView`).
- `understand/page.tsx`: pass a prop that disables feedback UI for solution sessions.

## Security & Authorization

- Always enforce membership via `requireHiveMember` before reading reports, responses, or votes.
- For report selection, ensure the source report conversation is in the **same hive** as the decision session.
- Never trust client tag input:
  - Enforce proposal tagging server-side for `type === "decide"`.
- Voting budget enforcement must be server-side, ideally in a single atomic operation.

## Validation

- Zod schemas in `lib/conversations/schemas.ts` for any new request bodies and query parameters.
- Introduce new contract types in `types/`:
  - `types/conversation-vote.ts` (vote API contracts and view models)
  - `types/conversations.ts` updates (header tabs union should include `"vote"` for decision sessions if needed)

## Testing Plan

Add tests near existing patterns:

- Wizard hook:
  - Extend `lib/conversations/react/__tests__/useNewSessionWizard.test.tsx` for decision flow:
    - lists reports
    - selects a report and passes ids into createConversation
- API routes:
  - `app/tests/api/*` for:
    - listing problem reports (401/403/empty)
    - enforcing proposal tag for decision responses
    - feedback disabled for decision sessions
    - vote budget enforcement (happy path, over-budget, negative, wrong tag)
- Server services:
  - If adding a vote service in `lib/conversations/server/*`, add unit tests with injected Supabase mocks.

## Observability

- Add consistent log prefixes for new endpoints (e.g. `[GET /api/hives/:hiveId/problem-reports]`, `[POST /api/conversations/:id/votes]`).
- Do not log report HTML content or any secrets.

## Rollout / Migration

1. DB migration adds:
   - conversation source report fields
   - proposal votes table (+ optional RPC for atomic voting)
2. Add API endpoints and types.
3. Update wizard step 2 branching for `decide`.
4. Implement solution-space Listen/Understand behavior changes.
5. Add Vote tab + header wiring.
6. Add tests and update `lib/conversations/README.md` + `docs/feature-map.md` when implementing (not required for this spec file).

## Open Questions

1. Should decision sessions generate a report like problem sessions?
   - If yes: update `app/api/conversations/[conversationId]/report/route.ts` and `lib/conversations/domain/reportRules.ts` to allow `type === "decide"` with a different prompt (include proposals + vote totals).
2. Should linking a report pin a version (recommended) or always show latest?
3. On Vote tab, do we allow “reset votes” to persist (server call) or only reset local UI?
4. Should proposals be editable/deletable? If yes, how does that affect votes?

