# New Session Flow Design

**Date:** 2026-02-27
**Status:** Approved
**Approach:** Minimal Branching (Approach A)

## Overview

Redesign the "New session" creation flow from the hive homepage with a tabbed modal supporting three conversation types: Understand, Deliberate, and Decide. Introduces a new `"explore"` conversation type that forks the existing "understand a problem" flow without voting/feedback.

## Requirements Summary

| Aspect | Decision |
|--------|----------|
| New modal | Tabbed entry point (Understand/Deliberate/Decide) with image placeholders |
| Deliberate | Disabled with "Coming soon" |
| Tab action | Opens respective existing wizard |
| New type | `"explore"` in database (distinct from `"understand"`) |
| Voting | Removed entirely from explore conversations |
| Statement ordering | By response count descending (global change) |
| Results tab | Remove counters/consensus matrix, add "Recommended Next Steps" |
| Continue CTA | Disabled with "Coming soon" tooltip |
| Report prompt | Separate file for explore (no voting data) |
| Consensus slider | Hidden via feature flag |
| Existing types | Keep "understand a problem" working |

## Design

### 1. Database & Type Changes

**New conversation type:**
```typescript
// types/conversations.ts
type ConversationType = "understand" | "explore" | "decide";
```

**Phase mapping for explore:**
- Uses same phases as understand: `listen_open → understand_open → report_open → closed`
- No new database migrations needed - the `type` column already accepts string values

**Feature flag for consensus threshold:**
```typescript
// lib/feature-flags.ts (new file)
export const FEATURE_FLAGS = {
  ENABLE_CONSENSUS_THRESHOLD: false,
} as const;
```

**Consolidated statement ordering change:**
- Modify `computeConsolidatedConsensusItems()` in `lib/conversations/domain/responseConsensus.ts`
- Sort by `responseCount` descending within each cluster (instead of `bucketIndex`)
- Applies globally to all conversation types

### 2. New Tabbed Modal (Session Type Selector)

**New component:** `app/components/session-type-selector.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Create a new session                          [X]  │
├─────────────────────────────────────────────────────┤
│  ┌───────────┐ ┌───────────┐ ┌───────────┐         │
│  │ Understand│ │ Deliberate│ │  Decide   │         │
│  │  (active) │ │           │ │           │         │
│  └───────────┘ └───────────┘ └───────────┘         │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐   │
│  │         [Image placeholder 300x200]         │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Input opinions, surface ideas, perspectives        │
│  and concerns from the group                        │
├─────────────────────────────────────────────────────┤
│                              [Create session]       │
└─────────────────────────────────────────────────────┘
```

**Tab content:**

| Tab | Description | Button state |
|-----|-------------|--------------|
| Understand | "Input opinions, surface ideas, perspectives and concerns from the group" | Enabled |
| Deliberate | "See where there's agreement, tension or divergence. Understand root causes." + "Coming soon" badge | Disabled |
| Decide | "Vote on what matters most with an allocation of credits for each participant." | Enabled |

**Behaviour:**
- Understand tab → opens `new-session-wizard` with `type="explore"`
- Decide tab → opens `decision-setup-wizard`
- Deliberate tab button is disabled

**Props:**
```typescript
interface SessionTypeSelectorProps {
  open: boolean;
  onClose: () => void;
  hiveId: string;
  hiveSlug?: string | null;
}
```

### 3. Explore Conversation UI Changes

**3a. Remove feedback/voting from explore conversations**

Files affected:
- `app/components/conversation/UnderstandView.tsx` - Hide agree/pass/disagree buttons when `type === "explore"`
- `app/components/conversation/ClusterBucketCard.tsx` - Hide feedback buttons when `type === "explore"`
- `lib/conversations/react/useConversationFeedback.ts` - Early return/no-op for explore type

**3b. Results tab changes for explore**

Current layout (understand/decide):
```
┌──────────────────┬──────────────────────────────┐
│  Counters        │  Report content              │
│  Consensus       │                              │
│  Matrix          │                              │
└──────────────────┴──────────────────────────────┘
```

New layout (explore only):
```
┌──────────────────┬──────────────────────────────┐
│  Recommended     │  Report content              │
│  Next Steps      │                              │
│                  │                              │
│  ┌────────────┐  │                              │
│  │ Continue   │  │                              │
│  │ convo      │  │                              │
│  │ (disabled) │  │                              │
│  └────────────┘  │                              │
└──────────────────┴──────────────────────────────┘
```

**Recommended Next Steps section:**
- Always shows: "Create a new deliberate conversation using these topics"
- CTA button: "Continue conversation" - disabled with "Coming soon" tooltip

### 4. Report Generation for Explore

**New prompt file:** `lib/conversations/prompts/exploreReportPrompt.ts`

**Report generation flow:**
```
generateReport(conversation)
    │
    ├── type === "explore" → use exploreReportPrompt
    │
    └── type === "understand" | "decide" → use existing prompt
```

**Explore report sections:**
1. **Executive Summary** - Brief overview of the conversation topic and participation
2. **Discovered Topics** - List of clusters with names and descriptions
3. **Key Themes** - For each cluster, the consolidated statements ordered by response count
4. **Participation Stats** - Response count, unique contributors (no voting metrics)

### 5. Wizard Modifications

**5a. Modify `new-session-wizard.tsx`**

- Accept new prop `type: "understand" | "explore"` (defaults to `"explore"`)
- Remove the type selection UI (handled by session type selector modal)
- Pass the type through to conversation creation API

```typescript
interface NewSessionWizardProps {
  open: boolean;
  onClose: () => void;
  hiveId: string;
  hiveSlug?: string | null;
  type?: "understand" | "explore";
}
```

**5b. Modify `decision-setup-wizard.tsx`**

- Import feature flag
- Conditionally hide consensus threshold slider in Step 3 when flag is off
- Keep all state/logic intact for re-enabling

**5c. Update `useNewSessionWizard.ts`**

- Accept type parameter
- Remove internal type state management
- Pass type to API call

### 6. Testing & Error Handling

**Test coverage:**

| Area | Test type | Description |
|------|-----------|-------------|
| Session type selector | Unit | Tab switching, button states, wizard launch |
| Explore conversation creation | Integration | API creates conversation with `type: "explore"` |
| Feedback disabled | Unit | Verify feedback hooks/components no-op for explore |
| Statement ordering | Unit | Verify response count descending sort |
| Explore report generation | Unit | Verify correct prompt used, no voting data |
| Feature flag | Unit | Consensus slider hidden when flag off |
| Existing understand type | Regression | Verify "understand" conversations still work |

**Migration considerations:**
- No database migration needed
- Existing "understand" conversations unaffected
- No data backfill required

## Files to Create

- `app/components/session-type-selector.tsx`
- `lib/feature-flags.ts`
- `lib/conversations/prompts/exploreReportPrompt.ts`

## Files to Modify

- `types/conversations.ts` - Add "explore" type
- `app/components/new-session-wizard.tsx` - Accept type prop, remove type selection
- `app/components/decision-setup-wizard.tsx` - Feature flag consensus slider
- `lib/conversations/react/useNewSessionWizard.ts` - Accept type parameter
- `lib/conversations/domain/responseConsensus.ts` - Sort by response count
- `app/components/conversation/UnderstandView.tsx` - Hide feedback for explore
- `app/components/conversation/ClusterBucketCard.tsx` - Hide feedback for explore
- `app/hives/[hiveId]/conversations/[conversationId]/result/page.tsx` - Conditional layout
- Report generation service - Branch on conversation type
