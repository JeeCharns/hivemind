# Deliberate Conversations Design

**Date:** 2026-02-27
**Status:** Approved

## Overview

Deliberate conversations allow users to gather sentiment on statements through a 5-point voting scale and comments. Users can create deliberations from existing understand conversation statements or from scratch.

## Data Model

### New Tables

**`deliberation_statements`** - Statements to deliberate on

```sql
CREATE TABLE deliberation_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  cluster_index INT,                    -- NULL if created from scratch
  statement_text TEXT NOT NULL,
  source_bucket_id UUID,                -- Reference to original cluster bucket (if from understand)
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**`deliberation_votes`** - User votes on statements (1-5 scale)

```sql
CREATE TABLE deliberation_votes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement_id UUID NOT NULL REFERENCES deliberation_statements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  guest_session_id UUID REFERENCES guest_sessions(id),
  vote_value INT NOT NULL CHECK (vote_value BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT one_vote_per_user UNIQUE (statement_id, user_id),
  CONSTRAINT one_vote_per_guest UNIQUE (statement_id, guest_session_id),
  CONSTRAINT must_have_voter CHECK (user_id IS NOT NULL OR guest_session_id IS NOT NULL)
);
```

**`deliberation_comments`** - Comments on statements

```sql
CREATE TABLE deliberation_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement_id UUID NOT NULL REFERENCES deliberation_statements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  guest_session_id UUID REFERENCES guest_sessions(id),
  comment_text TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT must_have_commenter CHECK (user_id IS NOT NULL OR guest_session_id IS NOT NULL)
);
```

### Type Updates

Add `"deliberate"` to `ConversationType` enum in `types/conversations.ts`.

### Vote Value Mapping

| Value | Label              |
|-------|--------------------|
| 5     | Deeply resonates   |
| 4     | Mostly resonates   |
| 3     | Mixed reaction     |
| 2     | It's complicated   |
| 1     | Strong aversion    |

## Wizard Flow

### Entry Points

Re-enable deliberate tab in `NewSessionLauncher`. Users choose between two paths:

### Path A: From Existing Understand Conversation

Reuses `DecisionSetupWizard` pattern with 5 steps:

1. **Source Selection** - Pick a completed understand conversation (analysis_status = 'ready')
2. **Cluster Selection** - Toggle which clusters to include
3. **Statement Selection** - Select consolidated statements from chosen clusters
4. **Settings** - Title, description
5. **Review** - Summary before creation

Key differences from decide wizard:
- No consensus threshold slider
- Settings step is simpler (no visibility/deadline options)
- Creates `deliberation_statements` instead of `decision_proposals`

### Path B: Create From Scratch

New wizard flow with 3 steps:

1. **Add Statements** - Manual text input for statements
   - Text area to add one statement at a time
   - List of added statements with delete/edit buttons
   - Optional: group statements into clusters (cluster name input)
   - Soft limit warning at 20 statements
2. **Settings** - Title, description
3. **Review** - Summary before creation

### Wizard State

```typescript
interface DeliberateSetupState {
  mode: 'from-understand' | 'from-scratch';
  step: number;

  // From-understand mode
  selectedSourceId: string | null;
  clusters: ClusterSelectionItem[];
  statements: StatementSelectionItem[];

  // From-scratch mode
  manualStatements: { text: string; clusterName?: string }[];

  // Common
  title: string;
  description: string;
}
```

## UI Components - Discuss Tab

### Layout Structure

Two-column layout (desktop) / stacked with drawer (mobile):

```
┌─────────────────────────────────────────────────────────────┐
│ ConversationHeader (Discuss | Analysis | Result tabs)        │
├────────────────────────────┬────────────────────────────────┤
│ LEFT COLUMN (40%)          │ RIGHT COLUMN (60%)             │
│                            │                                │
│ Cluster accordions with    │ Empty state OR                 │
│ statement list cards       │ StatementDetailPanel:          │
│                            │ - Statement text               │
│ Each card shows:           │ - VoteSlider (1-5 scale)       │
│ - Statement text (2 lines) │ - Pass button                  │
│ - Vote count icon          │ - Original responses accordion │
│ - Comment count icon       │ - Comment input                │
│                            │ - Comment list                 │
└────────────────────────────┴────────────────────────────────┘
```

### Left Column Components

- **ClusterAccordion** - Collapsible cluster sections with statement count badge
- **StatementListCard** - Compact card with truncated text and vote/comment counts

### Right Column Components

- **StatementDetailPanel** - Full statement view when selected
- **VoteSlider** - 5-point segmented control with labels
- **OriginalResponsesAccordion** - Expandable section (only if source_bucket_id exists)
- **CommentInput** - Text input with optional anonymous toggle
- **CommentList** - Flat list reusing ResponseCard styling

### Mobile Behaviour

- Left column fills screen initially
- Tapping statement opens right column as full-screen drawer
- Comment input anchored to bottom of viewport
- Back button to return to statement list

## Analysis & Result Tabs

Placeholders for now:
- Analysis: "Analysis will appear here"
- Result: "Result will appear here"

## API Endpoints

### Statements & Votes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/conversations/[id]/deliberate` | Get view model |
| POST | `/api/conversations/[id]/deliberate/votes` | Cast or update vote |
| GET | `/api/conversations/[id]/deliberate/statements/[statementId]/responses` | Lazy-load original responses |

### Comments

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/conversations/[id]/deliberate/comments` | Add comment |
| DELETE | `/api/conversations/[id]/deliberate/comments/[commentId]` | Delete own comment |

### Guest Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/guest/[token]/deliberate` | Guest view model |
| POST | `/api/guest/[token]/deliberate/votes` | Guest vote |
| POST | `/api/guest/[token]/deliberate/comments` | Guest comment |

### View Model

```typescript
interface DeliberateViewModel {
  conversationId: string;
  statements: DeliberateStatement[];
  userVotes: Record<string, number | null>;
  commentCounts: Record<string, number>;
}

interface DeliberateStatement {
  id: string;
  clusterIndex: number | null;
  clusterName: string | null;
  statementText: string;
  sourceBucketId: string | null;
  voteCount: number;
  averageVote: number | null;
  commentCount: number;
}
```

## File Structure

```
lib/deliberate-space/
├── server/
│   ├── createDeliberateSession.ts
│   ├── getDeliberateViewModel.ts
│   ├── getDeliberateSetupData.ts
│   ├── voteOnStatement.ts
│   └── addComment.ts
├── react/
│   ├── useDeliberateSetupWizard.ts
│   ├── useDeliberateVotes.ts
│   └── useDeliberateComments.ts
├── domain/
│   └── voteLabels.ts
└── schemas.ts

app/
├── hives/[hiveId]/conversations/[conversationId]/
│   └── discuss/page.tsx
├── components/
│   ├── deliberate-setup-wizard.tsx
│   └── conversation/
│       ├── DiscussView.tsx
│       ├── DiscussViewContainer.tsx
│       ├── StatementListCard.tsx
│       ├── StatementDetailPanel.tsx
│       ├── VoteSlider.tsx
│       └── DeliberateCommentList.tsx
├── api/
│   ├── deliberate-space/
│   │   ├── route.ts
│   │   └── setup/route.ts
│   └── conversations/[conversationId]/deliberate/
│       ├── route.ts
│       ├── votes/route.ts
│       ├── comments/route.ts
│       └── statements/[statementId]/responses/route.ts

types/
└── deliberate-space.ts

supabase/migrations/
└── 0XX_deliberate_tables.sql
```

## Realtime Updates

- Broadcast channel for instant comment updates
- Background sync every 30s for vote count refreshes
- Optimistic updates for voting
- Guest polling at 10s intervals

## Guest Access

Guests can participate in deliberate conversations:
- Vote on statements
- Add comments
- View all content

## Error Handling

- Zod validation on all inputs
- Standard `{ error, code? }` response shape
- Membership checks before mutations
- Rate limiting on comments (30/minute)

## Testing Approach

**Unit tests:** Vote mapping, view model construction, schema validation

**Integration tests:** Create session, vote, comment, guest flows

**E2E tests:** Full wizard flows, vote/comment interactions, mobile drawer

## Documentation Updates

- `docs/feature-map.md` - Add deliberate flow pointers
- `lib/conversations/README.md` - Add deliberate lifecycle
- `lib/deliberate-space/README.md` - Module documentation
