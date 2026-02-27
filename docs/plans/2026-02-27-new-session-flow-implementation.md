# New Session Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a new tabbed session creation modal with Understand/Deliberate/Decide tabs, introduce the "explore" conversation type (understand without voting), and update results tab layout for explore conversations.

**Architecture:** The new `session-type-selector.tsx` modal acts as an entry point that launches existing wizards. The "explore" type shares most infrastructure with "understand" but conditionally hides feedback UI. A feature flag controls the consensus threshold slider visibility.

**Tech Stack:** Next.js, React, TypeScript, Supabase, Tailwind CSS, Phosphor Icons

---

## Task 1: Add "explore" to ConversationType

**Files:**
- Modify: `types/conversations.ts:8`

**Step 1: Update the type definition**

In `types/conversations.ts`, change line 8 from:
```typescript
export type ConversationType = "understand" | "decide";
```

to:
```typescript
export type ConversationType = "understand" | "explore" | "decide";
```

**Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add types/conversations.ts
git commit -m "feat: add 'explore' conversation type"
```

---

## Task 2: Create Feature Flags Module

**Files:**
- Create: `lib/feature-flags.ts`
- Test: `lib/__tests__/feature-flags.test.ts`

**Step 1: Write the test**

Create `lib/__tests__/feature-flags.test.ts`:
```typescript
import { FEATURE_FLAGS } from "../feature-flags";

describe("FEATURE_FLAGS", () => {
  it("should have ENABLE_CONSENSUS_THRESHOLD set to false", () => {
    expect(FEATURE_FLAGS.ENABLE_CONSENSUS_THRESHOLD).toBe(false);
  });

  it("should be a frozen object", () => {
    expect(Object.isFrozen(FEATURE_FLAGS)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/feature-flags.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write the implementation**

Create `lib/feature-flags.ts`:
```typescript
/**
 * Feature Flags
 *
 * Centralised feature flag definitions.
 * These control experimental or phased feature rollouts.
 */

export const FEATURE_FLAGS = Object.freeze({
  /**
   * When true, shows the consensus threshold slider in the decision setup wizard.
   * Disabled until the Deliberate conversation flow is implemented.
   */
  ENABLE_CONSENSUS_THRESHOLD: false,
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/__tests__/feature-flags.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/feature-flags.ts lib/__tests__/feature-flags.test.ts
git commit -m "feat: add feature flags module with ENABLE_CONSENSUS_THRESHOLD"
```

---

## Task 3: Update Statement Ordering (Response Count Descending)

**Files:**
- Modify: `lib/conversations/domain/responseConsensus.ts:101-228`
- Test: `lib/conversations/domain/__tests__/responseConsensus.test.ts`

**Step 1: Write/update the test**

Add to the existing test file or create `lib/conversations/domain/__tests__/responseConsensus.test.ts`:
```typescript
import {
  computeConsolidatedConsensusItems,
  type ConsensusBucketRow,
  type ConsensusUnconsolidatedRow,
  type ConsensusFeedbackRow,
} from "../responseConsensus";

describe("computeConsolidatedConsensusItems", () => {
  it("should sort buckets by responseCount descending within voted/unvoted groups", () => {
    const buckets: ConsensusBucketRow[] = [
      {
        bucketId: "bucket-small",
        consolidatedStatement: "Small bucket",
        responseIds: ["r1", "r2"],
      },
      {
        bucketId: "bucket-large",
        consolidatedStatement: "Large bucket",
        responseIds: ["r3", "r4", "r5", "r6", "r7"],
      },
      {
        bucketId: "bucket-medium",
        consolidatedStatement: "Medium bucket",
        responseIds: ["r8", "r9", "r10"],
      },
    ];

    const unconsolidated: ConsensusUnconsolidatedRow[] = [];
    const feedback: ConsensusFeedbackRow[] = [];

    const result = computeConsolidatedConsensusItems(
      buckets,
      unconsolidated,
      feedback
    );

    // All unvoted, should be sorted by responseCount descending
    expect(result[0].id).toBe("bucket-large"); // 5 responses
    expect(result[1].id).toBe("bucket-medium"); // 3 responses
    expect(result[2].id).toBe("bucket-small"); // 2 responses
  });

  it("should put voted items first, then unvoted sorted by responseCount", () => {
    const buckets: ConsensusBucketRow[] = [
      {
        bucketId: "bucket-small-voted",
        consolidatedStatement: "Small voted",
        responseIds: ["r1"],
      },
      {
        bucketId: "bucket-large-unvoted",
        consolidatedStatement: "Large unvoted",
        responseIds: ["r2", "r3", "r4", "r5"],
      },
      {
        bucketId: "bucket-medium-unvoted",
        consolidatedStatement: "Medium unvoted",
        responseIds: ["r6", "r7"],
      },
    ];

    const unconsolidated: ConsensusUnconsolidatedRow[] = [];
    const feedback: ConsensusFeedbackRow[] = [
      { responseId: "r1", feedback: "agree" },
    ];

    const result = computeConsolidatedConsensusItems(
      buckets,
      unconsolidated,
      feedback
    );

    // Voted first
    expect(result[0].id).toBe("bucket-small-voted");
    // Then unvoted by responseCount descending
    expect(result[1].id).toBe("bucket-large-unvoted");
    expect(result[2].id).toBe("bucket-medium-unvoted");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/conversations/domain/__tests__/responseConsensus.test.ts`
Expected: FAIL (ordering doesn't match)

**Step 3: Update the implementation**

In `lib/conversations/domain/responseConsensus.ts`, modify `computeConsolidatedConsensusItems` to track response counts and sort accordingly.

Add `responseCount` to the internal processing and sort unvoted items by it:

```typescript
export function computeConsolidatedConsensusItems(
  buckets: ConsensusBucketRow[],
  unconsolidatedResponses: ConsensusUnconsolidatedRow[],
  feedbackRows: ConsensusFeedbackRow[]
): ConsensusItem[] {
  // Build a map of response ID -> feedback counts
  const feedbackByResponseId = new Map<
    string,
    { agree: number; pass: number; disagree: number }
  >();

  feedbackRows.forEach((row) => {
    if (!feedbackByResponseId.has(row.responseId)) {
      feedbackByResponseId.set(row.responseId, {
        agree: 0,
        pass: 0,
        disagree: 0,
      });
    }
    const counts = feedbackByResponseId.get(row.responseId)!;
    if (row.feedback === "agree") counts.agree++;
    else if (row.feedback === "pass") counts.pass++;
    else if (row.feedback === "disagree") counts.disagree++;
  });

  // Track items with their response counts for sorting
  const votedItems: Array<ConsensusItem & { _responseCount: number }> = [];
  const unvotedItems: Array<ConsensusItem & { _responseCount: number }> = [];

  // Process consolidated statements (buckets)
  for (const bucket of buckets) {
    const representativeId = bucket.responseIds[0];
    const counts = representativeId
      ? feedbackByResponseId.get(representativeId)
      : undefined;

    const totalAgree = counts?.agree ?? 0;
    const totalPass = counts?.pass ?? 0;
    const totalDisagree = counts?.disagree ?? 0;
    const totalVotes = totalAgree + totalPass + totalDisagree;
    const responseCount = bucket.responseIds.length;

    const item = {
      id: bucket.bucketId,
      responseText: bucket.consolidatedStatement,
      agreePercent: 0,
      passPercent: 0,
      disagreePercent: 0,
      agreeVotes: totalAgree,
      passVotes: totalPass,
      disagreeVotes: totalDisagree,
      totalVotes,
      _responseCount: responseCount,
    };

    if (totalVotes > 0) {
      item.agreePercent = clampPercent(
        Math.round((totalAgree / totalVotes) * 100)
      );
      item.disagreePercent = clampPercent(
        Math.round((totalDisagree / totalVotes) * 100)
      );
      item.passPercent = clampPercent(100 - item.agreePercent - item.disagreePercent);
      votedItems.push(item);
    } else {
      unvotedItems.push(item);
    }
  }

  // Process unconsolidated responses
  for (const response of unconsolidatedResponses) {
    const counts = feedbackByResponseId.get(response.responseId) || {
      agree: 0,
      pass: 0,
      disagree: 0,
    };
    const totalVotes = counts.agree + counts.pass + counts.disagree;

    const item = {
      id: response.responseId,
      responseText: response.responseText,
      agreePercent: 0,
      passPercent: 0,
      disagreePercent: 0,
      agreeVotes: counts.agree,
      passVotes: counts.pass,
      disagreeVotes: counts.disagree,
      totalVotes,
      _responseCount: 1, // Individual responses have count of 1
    };

    if (totalVotes > 0) {
      item.agreePercent = clampPercent(
        Math.round((counts.agree / totalVotes) * 100)
      );
      item.disagreePercent = clampPercent(
        Math.round((counts.disagree / totalVotes) * 100)
      );
      item.passPercent = clampPercent(100 - item.agreePercent - item.disagreePercent);
      votedItems.push(item);
    } else {
      unvotedItems.push(item);
    }
  }

  // Sort voted items by totalVotes descending
  votedItems.sort((a, b) => b.totalVotes - a.totalVotes);

  // Sort unvoted items by responseCount descending
  unvotedItems.sort((a, b) => b._responseCount - a._responseCount);

  // Combine and strip internal _responseCount field
  return [...votedItems, ...unvotedItems].map(
    ({ _responseCount, ...item }) => item
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/conversations/domain/__tests__/responseConsensus.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add lib/conversations/domain/responseConsensus.ts lib/conversations/domain/__tests__/responseConsensus.test.ts
git commit -m "feat: sort consolidated statements by response count descending"
```

---

## Task 4: Create Session Type Selector Modal

**Files:**
- Create: `app/components/session-type-selector.tsx`

**Step 1: Create the component**

Create `app/components/session-type-selector.tsx`:
```typescript
"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react";
import Button from "@/app/components/button";

type SessionTab = "understand" | "deliberate" | "decide";

interface TabContent {
  title: string;
  description: string;
  disabled: boolean;
  comingSoon?: boolean;
}

const TAB_CONTENT: Record<SessionTab, TabContent> = {
  understand: {
    title: "Understand",
    description:
      "Input opinions, surface ideas, perspectives and concerns from the group",
    disabled: false,
  },
  deliberate: {
    title: "Deliberate",
    description:
      "See where there's agreement, tension or divergence. Understand root causes.",
    disabled: true,
    comingSoon: true,
  },
  decide: {
    title: "Decide",
    description:
      "Vote on what matters most with an allocation of credits for each participant.",
    disabled: false,
  },
};

export interface SessionTypeSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelectUnderstand: () => void;
  onSelectDecide: () => void;
}

export default function SessionTypeSelector({
  open,
  onClose,
  onSelectUnderstand,
  onSelectDecide,
}: SessionTypeSelectorProps) {
  const [activeTab, setActiveTab] = useState<SessionTab>("understand");

  if (!open) return null;

  const currentTab = TAB_CONTENT[activeTab];

  const handleCreateSession = () => {
    if (activeTab === "understand") {
      onSelectUnderstand();
    } else if (activeTab === "decide") {
      onSelectDecide();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-[600px] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-h2 text-text-primary">Create a new session</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 transition"
            aria-label="Close"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6">
          {(["understand", "deliberate", "decide"] as SessionTab[]).map(
            (tab) => {
              const content = TAB_CONTENT[tab];
              const isActive = activeTab === tab;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-4 py-3 text-subtitle transition ${
                    isActive
                      ? "text-brand-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {content.title}
                  {content.comingSoon && (
                    <span className="ml-2 text-xs font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary" />
                  )}
                </button>
              );
            }
          )}
        </div>

        {/* Tab Content */}
        <div className="p-6 flex flex-col items-center gap-6">
          {/* Image Placeholder */}
          <div className="w-full max-w-[300px] h-[200px] bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
            <span className="text-slate-400 text-sm">Image placeholder</span>
          </div>

          {/* Description */}
          <p className="text-body text-text-secondary text-center max-w-md">
            {currentTab.description}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateSession}
            disabled={currentTab.disabled}
            title={currentTab.comingSoon ? "Coming soon" : undefined}
          >
            Create session
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add app/components/session-type-selector.tsx
git commit -m "feat: add session type selector modal with tabs"
```

---

## Task 5: Update New Session Launcher to Use Session Type Selector

**Files:**
- Modify: `app/components/new-session-launcher.tsx`

**Step 1: Update the launcher**

Replace `app/components/new-session-launcher.tsx`:
```typescript
"use client";

import { useState } from "react";
import { PlusIcon } from "@phosphor-icons/react";
import Button from "@/app/components/button";
import SessionTypeSelector from "./session-type-selector";
import NewSessionWizard from "./new-session-wizard";
import DecisionSetupWizard from "./decision-setup-wizard";

export default function NewSessionLauncher({
  asCard = false,
  hiveId,
  hiveSlug,
}: {
  asCard?: boolean;
  hiveId: string;
  hiveSlug?: string | null;
}) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [understandWizardOpen, setUnderstandWizardOpen] = useState(false);
  const [decideWizardOpen, setDecideWizardOpen] = useState(false);

  const handleSelectUnderstand = () => {
    setSelectorOpen(false);
    setUnderstandWizardOpen(true);
  };

  const handleSelectDecide = () => {
    setSelectorOpen(false);
    setDecideWizardOpen(true);
  };

  const handleCloseUnderstand = () => {
    setUnderstandWizardOpen(false);
  };

  const handleCloseDecide = () => {
    setDecideWizardOpen(false);
  };

  if (asCard) {
    return (
      <>
        <Button
          variant="secondary"
          className="w-full flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[#D7E0F0] p-10 h-64 bg-white/60 text-[#566888] hover:border-[#b8c7e6] hover:text-[#3A1DC8] transition-colors"
          onClick={() => setSelectorOpen(true)}
        >
          <span className="w-14 h-14 rounded-lg bg-[#DADDE1] flex items-center justify-center">
            <PlusIcon size={24} className="text-[#566888]" />
          </span>
          <span className="text-sm font-medium">Create New Session</span>
        </Button>
        <SessionTypeSelector
          open={selectorOpen}
          onClose={() => setSelectorOpen(false)}
          onSelectUnderstand={handleSelectUnderstand}
          onSelectDecide={handleSelectDecide}
        />
        <NewSessionWizard
          open={understandWizardOpen}
          onClose={handleCloseUnderstand}
          hiveId={hiveId}
          hiveSlug={hiveSlug}
          type="explore"
        />
        <DecisionSetupWizard
          open={decideWizardOpen}
          onClose={handleCloseDecide}
          hiveId={hiveId}
          hiveSlug={hiveSlug}
        />
      </>
    );
  }

  return (
    <>
      <Button
        onClick={() => setSelectorOpen(true)}
        className="h-10 w-[117px] whitespace-nowrap"
      >
        New Session
      </Button>
      <SessionTypeSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelectUnderstand={handleSelectUnderstand}
        onSelectDecide={handleSelectDecide}
      />
      <NewSessionWizard
        open={understandWizardOpen}
        onClose={handleCloseUnderstand}
        hiveId={hiveId}
        hiveSlug={hiveSlug}
        type="explore"
      />
      <DecisionSetupWizard
        open={decideWizardOpen}
        onClose={handleCloseDecide}
        hiveId={hiveId}
        hiveSlug={hiveSlug}
      />
    </>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: FAIL (NewSessionWizard doesn't accept `type` prop yet - this is expected, we'll fix in next task)

**Step 3: Commit (partial)**

```bash
git add app/components/new-session-launcher.tsx
git commit -m "feat: integrate session type selector into launcher"
```

---

## Task 6: Update New Session Wizard to Accept Type Prop

**Files:**
- Modify: `app/components/new-session-wizard.tsx`
- Modify: `lib/conversations/react/useNewSessionWizard.ts`

**Step 1: Update the hook to accept type**

In `lib/conversations/react/useNewSessionWizard.ts`:

1. Add `initialType` to props:
```typescript
export interface UseNewSessionWizardProps {
  hiveId: string;
  hiveSlug?: string | null;
  open: boolean;
  initialType?: "understand" | "explore";
}
```

2. Update the hook implementation to use `initialType`:
```typescript
export function useNewSessionWizard({
  hiveId,
  hiveSlug,
  open,
  initialType = "explore",
}: UseNewSessionWizardProps): UseNewSessionWizardReturn {
  // ...
  const [type, setType] = useState<ConversationType>(initialType);

  // In the reset effect:
  useEffect(() => {
    if (!open) return;
    // ...
    setType(initialType);
    // ...
  }, [open, initialType]);
```

**Step 2: Update the wizard component**

In `app/components/new-session-wizard.tsx`:

1. Add `type` prop:
```typescript
export default function NewSessionWizard({
  open,
  onClose,
  hiveId,
  hiveSlug,
  type: initialType = "explore",
}: {
  open: boolean;
  onClose: () => void;
  hiveId: string;
  hiveSlug?: string | null;
  type?: "understand" | "explore";
}) {
```

2. Pass it to the hook:
```typescript
const { /* ... */ } = useNewSessionWizard({
  hiveId,
  hiveSlug,
  open,
  initialType,
});
```

3. Remove the type selection UI from step 1 (the grid with "Discuss a Problem" / "Make a Decision" buttons).

4. Update the step 2 rendering to handle `explore` type (show CSV upload like `understand`):
```typescript
{step === 2 && (type === "understand" || type === "explore") && (
  // ... existing CSV upload UI
)}
```

**Step 3: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add app/components/new-session-wizard.tsx lib/conversations/react/useNewSessionWizard.ts
git commit -m "feat: update new session wizard to accept type prop, remove type selection UI"
```

---

## Task 7: Hide Consensus Threshold Behind Feature Flag

**Files:**
- Modify: `app/components/decision-setup-wizard.tsx:384-407`

**Step 1: Import feature flag and wrap the slider**

In `app/components/decision-setup-wizard.tsx`:

1. Add import:
```typescript
import { FEATURE_FLAGS } from "@/lib/feature-flags";
```

2. Wrap the consensus threshold UI in Step 3 with the feature flag:
```typescript
{/* Step 3: Statement Selection */}
{step === 3 && (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary">
        {FEATURE_FLAGS.ENABLE_CONSENSUS_THRESHOLD
          ? "Set a consensus threshold to recommend statements, then fine-tune your selection."
          : "Select which statements to include in the decision session."}
      </p>

      {FEATURE_FLAGS.ENABLE_CONSENSUS_THRESHOLD && (
        <div className="flex items-center gap-4 bg-slate-50 rounded-lg p-4">
          <label className="text-subtitle text-text-primary whitespace-nowrap">
            Consensus threshold:
          </label>
          <input
            type="range"
            min={50}
            max={90}
            value={consensusThreshold}
            onChange={(e) =>
              setConsensusThreshold(parseInt(e.target.value, 10))
            }
            className="flex-1"
          />
          <span className="text-subtitle text-text-primary w-12 text-right">
            {consensusThreshold}%
          </span>
        </div>
      )}
    </div>
    {/* ... rest of step 3 */}
```

3. Also hide the consensus threshold from the Step 5 summary:
```typescript
{/* Only show consensus threshold in summary if feature is enabled */}
{FEATURE_FLAGS.ENABLE_CONSENSUS_THRESHOLD && (
  <div>
    <span className="text-info text-text-secondary block mb-1">
      Consensus threshold
    </span>
    <span className="text-body text-text-primary">
      {consensusThreshold}%
    </span>
  </div>
)}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add app/components/decision-setup-wizard.tsx
git commit -m "feat: hide consensus threshold slider behind feature flag"
```

---

## Task 8: Hide Feedback/Voting UI for Explore Conversations

**Files:**
- Modify: `app/components/conversation/ClusterBucketCard.tsx:35,114-115`
- Modify: `app/components/conversation/UnderstandView.tsx` (multiple locations)

**Step 1: Update ClusterBucketCard props**

In `app/components/conversation/ClusterBucketCard.tsx`:

1. Update the prop type:
```typescript
/** Conversation type determines if voting is enabled */
conversationType?: "understand" | "explore" | "decide";
```

2. Update the `showVoting` condition:
```typescript
const showVoting =
  conversationType === "understand" && onVote && representativeId;
```

(No change needed - "explore" will correctly hide voting since it's not "understand")

**Step 2: Update UnderstandView to pass conversationType**

In `app/components/conversation/UnderstandView.tsx`:

1. Add `conversationType` prop:
```typescript
export interface UnderstandViewProps {
  // ... existing props
  conversationType?: "understand" | "explore" | "decide";
}
```

2. Pass it through and conditionally hide feedback buttons:

Find the section rendering feedback buttons (around line 896) and wrap with condition:
```typescript
{conversationType !== "explore" && (
  <div className="flex gap-1.5 mt-2">
    {(["agree", "pass", "disagree"] as Feedback[]).map(
      // ... feedback buttons
    )}
  </div>
)}
```

Also hide the vote counts display:
```typescript
{conversationType !== "explore" && resp.counts.agree + resp.counts.pass + resp.counts.disagree > 0 && (
  <span className="text-info text-slate-500">
    {resp.counts.agree} agree · {resp.counts.pass} pass · {resp.counts.disagree} disagree
  </span>
)}
```

3. Update ClusterBucketCard usage:
```typescript
<ClusterBucketCard
  // ... existing props
  conversationType={conversationType}
/>
```

**Step 3: Update UnderstandViewContainer to fetch and pass conversationType**

Check if there's an `UnderstandViewContainer.tsx` that wraps the view, and ensure `conversationType` is passed from the page level.

**Step 4: Update the understand page to pass conversationType**

In `app/hives/[hiveId]/conversations/[conversationId]/understand/page.tsx`, ensure the conversation type is fetched and passed to the view.

**Step 5: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 7: Commit**

```bash
git add app/components/conversation/ClusterBucketCard.tsx app/components/conversation/UnderstandView.tsx
git commit -m "feat: hide feedback/voting UI for explore conversations"
```

---

## Task 9: Update Results Tab for Explore Conversations

**Files:**
- Modify: `app/components/conversation/ReportView.tsx`
- Modify: `app/hives/[hiveId]/conversations/[conversationId]/result/page.tsx`
- Modify: `lib/conversations/server/getReportViewModel.ts` (if needed to pass conversationType)

**Step 1: Update ResultViewModel type to include conversationType**

In `types/conversation-report.ts`, add:
```typescript
export interface ResultViewModel {
  // ... existing fields
  conversationType?: "understand" | "explore" | "decide";
}
```

**Step 2: Update getReportViewModel to include conversationType**

In `lib/conversations/server/getReportViewModel.ts`, add to the return:
```typescript
return {
  // ... existing fields
  conversationType: conversation.type,
};
```

**Step 3: Update ReportView to conditionally render left column**

In `app/components/conversation/ReportView.tsx`:

```typescript
export default function ReportView({ viewModel }: ReportViewProps) {
  const isExplore = viewModel.conversationType === "explore";

  // ... existing code

  return (
    <div className="pt-4">
      <div className="mx-auto w-full max-w-7xl flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left column: different content for explore vs understand */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {isExplore ? (
              // Recommended Next Steps section for explore
              <div className="bg-white rounded-xl p-6">
                <h3 className="text-subtitle text-text-primary mb-4">
                  Recommended Next Steps
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-body text-text-secondary mb-3">
                      Create a new deliberate conversation using these topics
                    </p>
                    <Button
                      variant="secondary"
                      disabled
                      title="Coming soon"
                      className="w-full"
                    >
                      Continue conversation
                      <span className="ml-2 text-xs font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                        Coming soon
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              // Existing consensus matrix for understand conversations
              <>
                {shouldShowAnalysisPlaceholder ? (
                  <div className="bg-white rounded-xl p-6 flex flex-col justify-center items-center min-h-[200px]">
                    <Handshake size={56} className="text-[#9498B0]" />
                    <p className="mt-4 text-body text-text-secondary">
                      Analysis of the most agreed-upon themes will appear here.
                    </p>
                  </div>
                ) : shouldShowFeedbackEmptyState ? (
                  <div className="bg-white rounded-xl p-6 flex flex-col justify-center items-center min-h-[200px]">
                    <Handshake size={56} className="text-[#9498B0]" />
                    <p className="mt-4 text-body text-text-secondary">
                      No feedback yet. Vote on responses to see where people agree
                      or disagree.
                    </p>
                  </div>
                ) : null}
                {hasFeedbackData ? (
                  <ConsensusMatrix
                    items={consensusItems}
                    metrics={consensusMetrics}
                  />
                ) : null}
              </>
            )}
          </div>
          {/* Right column stays the same */}
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add app/components/conversation/ReportView.tsx types/conversation-report.ts lib/conversations/server/getReportViewModel.ts
git commit -m "feat: add recommended next steps section for explore results tab"
```

---

## Task 10: Create Explore Report Prompt

**Files:**
- Create: `lib/conversations/prompts/exploreReportPrompt.ts`
- Modify: `app/api/conversations/[conversationId]/report/route.ts`

**Step 1: Create the explore report prompt**

Create `lib/conversations/prompts/exploreReportPrompt.ts`:
```typescript
/**
 * Explore Report Prompt
 *
 * Generates the prompt for explore conversation reports.
 * Unlike understand reports, explore reports don't include voting data.
 */

export interface ExploreReportPromptData {
  title: string;
  responseCount: number;
  participantCount: number;
  themes: Array<{
    name: string;
    description: string;
    size: number;
  }>;
  consolidatedStatements: Array<{
    statement: string;
    responseCount: number;
  }>;
  sampleResponses: string[];
}

export function buildExploreReportPrompt(data: ExploreReportPromptData): string {
  const themesText = data.themes
    .map(
      (t) =>
        `- ${t.name || "Untitled"}: ${t.description || "N/A"} (${t.size || 0} responses)`
    )
    .join("\n");

  const statementsText = data.consolidatedStatements
    .map((s) => `- "${s.statement}" (from ${s.responseCount} responses)`)
    .join("\n\n");

  const sampleResponsesText = data.sampleResponses
    .map((r) => `- "${r}"`)
    .join("\n");

  return `# Conversation: ${data.title || "Untitled Conversation"}

## Participants
- ${data.participantCount} total participants
- ${data.responseCount} responses collected

## Themes
${themesText || "No themes identified."}

## Consolidated Statements
${statementsText || "No statements yet."}

## Sample of Participant Responses
${sampleResponsesText || "No responses available."}

---

Write a narrative executive summary of this conversation for its participants.
Do not simply list statements — synthesise, draw connections, and explain
what the collective voice is saying.

Structure the document with the following sections (using HTML headings):
1. Executive Summary — a concise overview of the conversation, participation, and headline findings
2. Key Themes — the main themes that emerged, with narrative connecting them
3. Common Perspectives — the most commonly expressed viewpoints, with context about what participants are saying
4. Recommended Next Steps — actionable suggestions for what the group should do next. Consider recommending:
   - Running a follow-up session to explore specific themes in more depth
   - Areas that need further discussion or clarification
   Be specific about which statements or themes each recommendation relates to.

Use whatever writing style best communicates each point — narrative prose, lists, or a mix.`;
}

export const EXPLORE_REPORT_SYSTEM_PROMPT =
  'You are a skilled analyst writing for participants of a collective conversation. Your role is to help them understand what the group collectively expressed. Write in a natural narrative style — not a list of results, but a cohesive document that synthesises findings, draws connections between themes, and surfaces meaningful insights. Use a neutral, evidence-grounded tone. Output valid HTML only — no markdown, no code fences, no preamble. Scale the depth and length of your writing to match the complexity of the data: a small simple conversation warrants a focused summary, a large complex one warrants deeper analysis.';
```

**Step 2: Update the report route to branch on conversation type**

In `app/api/conversations/[conversationId]/report/route.ts`:

1. Add import:
```typescript
import {
  buildExploreReportPrompt,
  EXPLORE_REPORT_SYSTEM_PROMPT,
} from "@/lib/conversations/prompts/exploreReportPrompt";
```

2. Update the type validation (line 148-152) to allow "explore":
```typescript
if (conversation.type !== "understand" && conversation.type !== "explore") {
  return jsonError(
    "Reports can only be generated for 'understand' or 'explore' conversations",
    409
  );
}
```

3. After building the data, branch on conversation type:
```typescript
// Build prompt based on conversation type
let userMessage: string;
let systemPrompt: string;

if (conversation.type === "explore") {
  // Build explore-specific prompt (no voting data)
  const exploreData = {
    title: conversation.title || "Untitled Conversation",
    responseCount: responseCount || 0,
    participantCount: totalParticipants,
    themes: themes.map((t) => ({
      name: t.name || "Untitled",
      description: t.description || "",
      size: t.size || 0,
    })),
    consolidatedStatements: consolidatedStatements.map((s) => ({
      statement: s.statement,
      responseCount: s.totalVotes, // Reusing field, though it's not votes for explore
    })),
    sampleResponses: sampleResponses.map((r) => r.response_text),
  };
  userMessage = buildExploreReportPrompt(exploreData);
  systemPrompt = EXPLORE_REPORT_SYSTEM_PROMPT;
} else {
  // Existing understand prompt with voting data
  userMessage = /* existing prompt */;
  systemPrompt = /* existing system prompt */;
}

// Call Claude with the appropriate prompt
const aiResponse = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 8000,
  temperature: 0.4,
  system: systemPrompt,
  messages: [{ role: "user", content: userMessage }],
});
```

**Step 3: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add lib/conversations/prompts/exploreReportPrompt.ts app/api/conversations/[conversationId]/report/route.ts
git commit -m "feat: add separate report prompt for explore conversations"
```

---

## Task 11: Update Report Gating for Explore Type

**Files:**
- Modify: `lib/conversations/domain/reportRules.ts`

**Step 1: Allow explore type in canGenerateReport**

In `lib/conversations/domain/reportRules.ts`, update the type check:
```typescript
export function canGenerateReport(
  isMember: boolean,
  conversationType: string,
  analysisStatus: string | null,
  gate: { allowed: boolean }
): boolean {
  if (!isMember) return false;
  if (conversationType !== "understand" && conversationType !== "explore") return false;
  if (analysisStatus !== "ready") return false;
  return gate.allowed;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add lib/conversations/domain/reportRules.ts
git commit -m "feat: allow report generation for explore conversations"
```

---

## Task 12: Final Integration Testing and Lint

**Step 1: Run full type check**

Run: `npm run typecheck`
Expected: PASS

**Step 2: Run linter**

Run: `npm run lint`
Expected: PASS (fix any issues)

**Step 3: Run formatter**

Run: `npm run format:write`
Expected: Files formatted

**Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 5: Manual smoke test**

1. Navigate to a hive homepage
2. Click "New Session" - should show tabbed modal
3. Verify tabs: Understand (enabled), Deliberate (disabled with "Coming soon"), Decide (enabled)
4. Select Understand → should open wizard for explore type
5. Create an explore conversation
6. Verify no feedback buttons appear on responses
7. Generate a report and verify it doesn't reference voting data

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and formatting for new session flow"
```

---

## Summary of All Changes

| File | Change |
|------|--------|
| `types/conversations.ts` | Add "explore" type |
| `lib/feature-flags.ts` | New file with ENABLE_CONSENSUS_THRESHOLD |
| `lib/conversations/domain/responseConsensus.ts` | Sort by response count descending |
| `app/components/session-type-selector.tsx` | New tabbed modal component |
| `app/components/new-session-launcher.tsx` | Integrate session type selector |
| `app/components/new-session-wizard.tsx` | Accept type prop, remove type selection |
| `lib/conversations/react/useNewSessionWizard.ts` | Accept initialType prop |
| `app/components/decision-setup-wizard.tsx` | Feature flag consensus slider |
| `app/components/conversation/ClusterBucketCard.tsx` | Hide voting for explore |
| `app/components/conversation/UnderstandView.tsx` | Hide feedback for explore |
| `app/components/conversation/ReportView.tsx` | Recommended next steps for explore |
| `types/conversation-report.ts` | Add conversationType to ResultViewModel |
| `lib/conversations/server/getReportViewModel.ts` | Include conversationType |
| `lib/conversations/prompts/exploreReportPrompt.ts` | New explore report prompt |
| `app/api/conversations/[conversationId]/report/route.ts` | Branch on type for prompt |
| `lib/conversations/domain/reportRules.ts` | Allow explore in canGenerateReport |
