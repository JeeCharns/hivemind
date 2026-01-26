# Decision Space Design

## Overview

Decision Space is a new session type that enables structured voting on statements derived from understand sessions. Users select high-consensus statements from completed understand sessions and run quadratic voting rounds to reach group decisions.

## Setup Flow

### Entry Point
User clicks "New Session" and selects "Decide Space"

### Step 1 - Source Selection
- Dropdown of understand sessions from this hive with `analysis_status: "completed"`
- Each option shows: session title, participant count, cluster count, date
- Required selection

### Step 2 - Cluster Selection
- Displays all clusters from source session as cards
- Each card shows: cluster name, description, statement count, avg consensus %
- Multi-select with checkboxes
- "Select All" / "Deselect All" buttons
- At least 1 cluster required

### Step 3 - Statement Selection
- For each selected cluster, shows statements ranked by consensus (highest first)
- Configurable threshold slider (50-90%) - statements above threshold are pre-checked
- "Select All" button per cluster
- Each statement shows: text preview, agree %, total votes from source
- At least 1 statement required

### Step 4 - Settings
- Title (required, 1-200 chars)
- Description (optional, max 1000 chars)
- Voting deadline (optional date picker)
- Visibility setting: Hidden / Aggregate only / Fully transparent

## Data Model

### New Tables

#### `decision_proposals`
Snapshotted statements for voting.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| conversation_id | UUID | FK to decide session |
| source_bucket_id | UUID | FK to original `conversation_cluster_buckets`, nullable |
| source_cluster_index | integer | Which cluster it came from |
| statement_text | text | Copied at creation time |
| original_agree_percent | decimal | Consensus at time of import |
| display_order | integer | UI ordering within cluster |
| created_at | timestamp | |

#### `decision_rounds`
Versioned voting rounds.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| conversation_id | UUID | FK to decide session |
| round_number | integer | Starts at 1 |
| status | enum | `voting_open`, `voting_closed`, `results_generated` |
| deadline | timestamp | Nullable, auto-close time |
| visibility | enum | `hidden`, `aggregate`, `transparent` |
| opened_at | timestamp | |
| closed_at | timestamp | Nullable |

#### `decision_votes`
Votes per round.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| round_id | UUID | FK to `decision_rounds` |
| user_id | UUID | FK to user |
| proposal_id | UUID | FK to `decision_proposals` |
| votes | integer | Vote count (quadratic cost applies) |
| created_at | timestamp | |
| updated_at | timestamp | |

#### `decision_results`
Generated results per round.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| round_id | UUID | FK to `decision_rounds` |
| proposal_rankings | JSONB | Ordered list with vote totals |
| ai_analysis | text | Generated document |
| generated_at | timestamp | |

### Budget
- Each user gets 99 credits per round
- Vote cost = votes squared (1 vote = 1 credit, 2 votes = 4 credits, etc.)
- Budget resets each round
- Enforced atomically via PostgreSQL RPC

## Decide Space Tabs

### Tab 1 - Listen (Read-only briefing)

**Layout:**
- Grouped by cluster/topic
- Each cluster is a collapsible section with header showing: cluster name, statement count
- Statements shown as cards within each cluster, ordered by original consensus %
- Each statement card shows: text, original agree % badge, vote count from source

**Expandable detail:**
- Click statement to expand and reveal original responses that formed it
- Shows response text and author (based on hive anonymity settings)
- Collapsed by default

### Tab 2 - Decide (Quadratic voting)

**Layout:**
- Budget display at top: "You have X credits remaining" with visual bar
- Statements listed grouped by cluster
- Each statement has +/- buttons to allocate votes
- Shows current vote count and cost for next vote
- Real-time budget deduction

**Visibility behavior (based on admin setting):**
- Hidden: no vote totals shown
- Aggregate: shows total votes per statement from all users
- Transparent: shows who voted what (expandable per statement)

### Tab 3 - Results (After round closes)

**Layout - two columns:**

**Left column:** Ranked list of proposals by total votes
- Shows: rank, statement text, total votes, vote %, change from previous round (if applicable)

**Right column:** AI-generated analysis document

## Voting Lifecycle

### Starting a Round
- First round auto-created when decide session is created
- Status begins as `voting_open`
- Deadline and visibility set during setup

### Closing a Round
- Admin clicks "Close Voting" button (manual), OR
- Auto-closes when deadline passes (background job)
- Status changes to `voting_closed`
- Triggers results generation
- Status changes to `results_generated`
- Results tab becomes visible

### Starting a New Round
- Admin clicks "Start New Round" from Results tab
- Prompt: "Keep same proposals or modify?"
  - **Keep same:** new round with same proposals, votes reset to zero
  - **Modify:** returns to statement selection step, can add/remove proposals
- New `decision_round` created with incremented `round_number`
- Previous round results remain accessible via dropdown

## AI-Generated Results Document

### Generation Trigger
- Automatic when round closes
- Can be regenerated by admin

### Document Structure

```markdown
## Decision Summary
[1-2 paragraphs: what was decided, participation rate, vote distribution overview]

## Top Outcomes
[Ranked list of top 3-5 proposals with vote totals and why they resonated]

## Minority Perspectives
[Items that received 10%+ of votes but didn't win - important dissent to acknowledge]

## Comparison to Original Consensus
[How voting results align with understand session feedback:
- Which high-consensus statements also won votes? (validation)
- Which diverged? (tension to explore)]

## Recommended Next Steps
[Actionable items based on results]

## Suggested Follow-up Sessions
[Specific recommendations like:
- "Run an understand session to explore [minority topic] further"
- "Create a decide session focused on implementation for [winning proposal]"
- "Gather feedback on [area of tension] before proceeding"]
```

### LLM Inputs
- All proposals with vote totals and rankings
- Original consensus data from source understand session
- Round metadata (participation rate, deadline, visibility)
- Previous round results if applicable

## Edge Cases & Constraints

### Minimum Requirements
- Source understand session must have `analysis_status: "completed"`
- At least 1 cluster and 1 statement must be selected
- At least 1 vote should be cast before closing (warn if not)

### Empty States
- No eligible understand sessions: "Complete an understand session with analysis first"
- No statements above threshold: Show all statements, none pre-checked
- No votes cast when closing: Warn "No votes recorded. Close anyway?"

### Access Control
- Only hive admins can: create decide sessions, close rounds, start new rounds
- All hive members can: vote and view results
- Non-members: no access (existing hive auth)

### Deleted Source Data
- If source understand session deleted, decide session keeps working (snapshotted)
- `source_bucket_id` becomes orphaned but proposals remain intact
- Traceability link shows "Source no longer available"

### Concurrency
- Vote budget enforcement atomic via PostgreSQL RPC
- Round status changes protected by optimistic locking

## Migration from Existing Vote Tables

The existing `quadratic_vote_allocations` and `quadratic_vote_budgets` tables are used by the current (simpler) decide session implementation. This design introduces new tables (`decision_votes`, `decision_rounds`) to support versioned rounds. A migration strategy will be needed if existing decide sessions should be preserved.

## Open Questions

None - all requirements clarified during design session.
