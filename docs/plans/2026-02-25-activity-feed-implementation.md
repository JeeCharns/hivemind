# Activity Feed Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show meaningful activity events on hive homepage including conversation creation, analysis completion, report generation, and voting round closure.

**Architecture:** Inline logging approach — add `logActivity()` calls directly in existing service functions where events occur. Update schema to replace unused event types with new ones.

**Tech Stack:** Supabase (PostgreSQL), TypeScript, React

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/045_update_activity_event_types.sql`

**Step 1: Write the migration**

```sql
-- Migration: Update hive_activity event_type constraint
-- Removes unused 'response' and 'vote' types, adds new activity types

-- Remove old constraint
ALTER TABLE hive_activity DROP CONSTRAINT hive_activity_event_type_check;

-- Add new constraint with updated event types
ALTER TABLE hive_activity ADD CONSTRAINT hive_activity_event_type_check
  CHECK (event_type IN (
    'join',
    'conversation_created',
    'analysis_complete',
    'report_generated',
    'round_closed'
  ));
```

**Step 2: Verify migration syntax**

Run: `cd supabase && cat migrations/045_update_activity_event_types.sql`
Expected: Migration file content displayed

**Step 3: Commit**

```bash
git add supabase/migrations/045_update_activity_event_types.sql
git commit -m "feat(db): update activity event types schema"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `lib/social/types.ts`

**Step 1: Update ActivityEventType**

Replace the existing `ActivityEventType` and add `ActivityEventMetadata`:

```typescript
export type ActivityEventType =
  | "join"
  | "conversation_created"
  | "analysis_complete"
  | "report_generated"
  | "round_closed";

export interface ActivityEventMetadata {
  conversationId?: string;
  conversationTitle?: string;
  conversationType?: "understand" | "decide";
  version?: number;
  roundId?: string;
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No new errors (existing code using old types will error - that's expected and fixed in later tasks)

**Step 3: Commit**

```bash
git add lib/social/types.ts
git commit -m "feat(types): update activity event types and add metadata interface"
```

---

## Task 3: Update Activity Service Tests

**Files:**
- Modify: `lib/social/server/__tests__/activityService.test.ts`

**Step 1: Update test to use new event type**

Change line 39 from `eventType: "response"` to `eventType: "conversation_created"`:

```typescript
it("should allow null userId for anonymised events", async () => {
  const supabase = createMockSupabase({ error: null });

  await logActivity(supabase, {
    hiveId: "hive-123",
    eventType: "conversation_created",
    userId: null,
    metadata: { conversationId: "conv-1", conversationTitle: "Test" },
  });

  expect(supabase.from("hive_activity").insert).toHaveBeenCalledWith({
    hive_id: "hive-123",
    event_type: "conversation_created",
    user_id: null,
    metadata: { conversationId: "conv-1", conversationTitle: "Test" },
  });
});
```

**Step 2: Run tests**

Run: `npm test -- lib/social/server/__tests__/activityService.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add lib/social/server/__tests__/activityService.test.ts
git commit -m "test: update activity service test for new event types"
```

---

## Task 4: Log Activity on Conversation Created

**Files:**
- Modify: `lib/conversations/server/createConversation.ts`

**Step 1: Add import**

Add at top of file:

```typescript
import { logActivity } from "@/lib/social/server/activityService";
```

**Step 2: Add logging after successful insert**

After line 124 (after `return {`), insert before the return statement:

```typescript
  // Log activity for hive feed
  await logActivity(supabase, {
    hiveId,
    eventType: "conversation_created",
    userId,
    metadata: {
      conversationId: data.id,
      conversationTitle: title,
      conversationType: type,
    },
  });

  return {
    id: data.id,
    slug: data.slug,
  };
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add lib/conversations/server/createConversation.ts
git commit -m "feat: log activity when conversation is created"
```

---

## Task 5: Log Activity on Analysis Complete (Full)

**Files:**
- Modify: `lib/conversations/server/runConversationAnalysis.ts`

**Step 1: Add import**

Add at top of file:

```typescript
import { logActivity } from "@/lib/social/server/activityService";
```

**Step 2: Modify conversation fetch to include title and hive_id**

Find the early return case (around line 75-79) where we check for no responses. Before that section, we need to fetch conversation data. Add after line 73:

```typescript
    // 4. Fetch responses
    const responses = await fetchResponses(supabase, conversationId);

    // 4a. Fetch conversation metadata for activity logging
    const { data: conversationData } = await supabase
      .from("conversations")
      .select("title, hive_id")
      .eq("id", conversationId)
      .single();
```

**Step 3: Add logging after status update to ready**

After line 353 (`await updateAnalysisStatus(supabase, conversationId, "ready");`), add:

```typescript
    // 21a. Log activity for hive feed
    if (conversationData) {
      await logActivity(supabase, {
        hiveId: conversationData.hive_id,
        eventType: "analysis_complete",
        metadata: {
          conversationId,
          conversationTitle: conversationData.title,
        },
      });
    }
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add lib/conversations/server/runConversationAnalysis.ts
git commit -m "feat: log activity when analysis completes (full)"
```

---

## Task 6: Log Activity on Analysis Complete (Incremental)

**Files:**
- Modify: `lib/conversations/server/runConversationAnalysisIncremental.ts`

**Step 1: Add import**

Add at top of file:

```typescript
import { logActivity } from "@/lib/social/server/activityService";
```

**Step 2: Modify conversation fetch to include title and hive_id**

Change line 61-64 from:

```typescript
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("analysis_updated_at, analysis_response_count")
      .eq("id", conversationId)
      .single();
```

To:

```typescript
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("analysis_updated_at, analysis_response_count, title, hive_id")
      .eq("id", conversationId)
      .single();
```

**Step 3: Add logging after status update to ready**

After line 275 (`await updateAnalysisStatus(supabase, conversationId, "ready");`), add:

```typescript
    // 12a. Log activity for hive feed
    if (conversation) {
      await logActivity(supabase, {
        hiveId: conversation.hive_id,
        eventType: "analysis_complete",
        metadata: {
          conversationId,
          conversationTitle: conversation.title,
        },
      });
    }
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add lib/conversations/server/runConversationAnalysisIncremental.ts
git commit -m "feat: log activity when analysis completes (incremental)"
```

---

## Task 7: Log Activity on Report Generated

**Files:**
- Modify: `app/api/conversations/[conversationId]/report/route.ts`

**Step 1: Add import**

Add after line 6:

```typescript
import { logActivity } from "@/lib/social/server/activityService";
```

**Step 2: Add logging after successful report insert**

After line 476 (after the `if (insertError || !newReport)` check), add:

```typescript
    // 13a. Log activity for hive feed
    await logActivity(supabase, {
      hiveId: conversation.hive_id,
      eventType: "report_generated",
      userId: session.user.id,
      metadata: {
        conversationId,
        conversationTitle: conversation.title,
        version: newReport.version,
      },
    });
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add app/api/conversations/[conversationId]/report/route.ts
git commit -m "feat: log activity when report is generated"
```

---

## Task 8: Log Activity on Voting Round Closed

**Files:**
- Modify: `lib/decision-space/server/closeDecisionRound.ts`

**Step 1: Add import**

Add at top of file:

```typescript
import { logActivity } from "@/lib/social/server/activityService";
```

**Step 2: Modify conversation fetch to include title**

Change line 23-29 from:

```typescript
    .select(
      `
      id,
      conversation_id,
      status,
      conversations!inner (
        hive_id
      )
    `
    )
```

To:

```typescript
    .select(
      `
      id,
      conversation_id,
      status,
      conversations!inner (
        hive_id,
        title
      )
    `
    )
```

**Step 3: Update type assertion**

Change line 45 from:

```typescript
  const conversations = round.conversations as unknown as { hive_id: string };
```

To:

```typescript
  const conversations = round.conversations as unknown as { hive_id: string; title: string };
```

**Step 4: Add logging after round close**

After line 69 (after the `if (updateError)` check), add:

```typescript
  // 3a. Log activity for hive feed
  await logActivity(supabase, {
    hiveId,
    eventType: "round_closed",
    userId,
    metadata: {
      conversationId: round.conversation_id,
      conversationTitle: conversations.title,
      roundId,
    },
  });
```

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add lib/decision-space/server/closeDecisionRound.ts
git commit -m "feat: log activity when voting round is closed"
```

---

## Task 9: Update Activity Sidebar Display

**Files:**
- Modify: `components/social/ActivitySidebar.tsx`

**Step 1: Add metadata type import**

Add to import:

```typescript
import type { ActivityEvent, ActivityEventMetadata } from "@/lib/social/types";
```

**Step 2: Replace getActivityText function**

Replace lines 15-30 with:

```typescript
function getActivityText(event: ActivityEvent): string {
  const meta = event.metadata as ActivityEventMetadata;
  const title = meta.conversationTitle
    ? `'${meta.conversationTitle}'`
    : "a conversation";

  switch (event.eventType) {
    case "join":
      return "Someone joined";
    case "conversation_created":
      return `New conversation: ${title}`;
    case "analysis_complete":
      return `Analysis complete for ${title}`;
    case "report_generated":
      return `Report generated for ${title}`;
    case "round_closed":
      return `Voting closed for ${title}`;
    default:
      return "Activity";
  }
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add components/social/ActivitySidebar.tsx
git commit -m "feat: update activity sidebar to display new event types"
```

---

## Task 10: Final Verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run linting**

Run: `npm run lint`
Expected: No errors

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Final commit (if any formatting changes)**

```bash
git add -A
git commit -m "chore: formatting cleanup" --allow-empty
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Database migration | `supabase/migrations/045_update_activity_event_types.sql` |
| 2 | TypeScript types | `lib/social/types.ts` |
| 3 | Update tests | `lib/social/server/__tests__/activityService.test.ts` |
| 4 | Log conversation created | `lib/conversations/server/createConversation.ts` |
| 5 | Log analysis complete (full) | `lib/conversations/server/runConversationAnalysis.ts` |
| 6 | Log analysis complete (incremental) | `lib/conversations/server/runConversationAnalysisIncremental.ts` |
| 7 | Log report generated | `app/api/conversations/[conversationId]/report/route.ts` |
| 8 | Log round closed | `lib/decision-space/server/closeDecisionRound.ts` |
| 9 | Update sidebar display | `components/social/ActivitySidebar.tsx` |
| 10 | Final verification | N/A |
