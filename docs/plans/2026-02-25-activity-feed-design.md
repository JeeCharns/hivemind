# Activity Feed Enhancement Design

## Overview

Enhance the hive homepage activity feed to show meaningful activity events including conversation creation, analysis completion, report generation, and voting round closure. Activity items will include conversation names for context.

## Requirements

- Show latest 3 activity items with "Load more" to expand (already implemented)
- Activity types to show:
  - New people joined (existing `join`)
  - New conversation created
  - Analysis completed for a conversation
  - Report generated for a conversation
  - Voting round closed
- Activity types NOT to show (remove from schema):
  - `response` (someone shared an idea)
  - `vote` (someone voted)
- Include conversation name in activity text (e.g., "Analysis complete for 'Team Feedback Survey'")

## Design

### 1. Database Schema

Migration to update `hive_activity.event_type` constraint:

```sql
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

Metadata structure for each event type:

| Event Type             | Metadata                                                  |
| ---------------------- | --------------------------------------------------------- |
| `join`                 | `{}` (unchanged)                                          |
| `conversation_created` | `{ conversationId, conversationTitle, conversationType }` |
| `analysis_complete`    | `{ conversationId, conversationTitle }`                   |
| `report_generated`     | `{ conversationId, conversationTitle, version }`          |
| `round_closed`         | `{ conversationId, conversationTitle, roundId }`          |

### 2. TypeScript Types

Update `lib/social/types.ts`:

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

### 3. Logging Locations

Add `logActivity()` calls in these locations:

1. **Conversation Created** — `lib/conversations/server/createConversation.ts` (after successful insert)
2. **Analysis Complete** — `lib/conversations/server/runConversationAnalysis.ts` and `runConversationAnalysisIncremental.ts` (after status set to "ready")
3. **Report Generated** — `app/api/conversations/[conversationId]/report/route.ts` (after successful report insert)
4. **Round Closed** — `lib/decision-space/server/closeDecisionRound.ts` (after successful round close)

### 4. UI Display

Update `components/social/ActivitySidebar.tsx` — `getActivityText()` function:

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

## Unchanged Components

- Real-time subscriptions (already working via Supabase Realtime)
- "Load more" pagination (already shows 3 initially, expands on click)
- Activity service (`logActivity` function works as-is)
- Activity hook (`useHiveActivity` works as-is)

## Approach

Inline logging — add `logActivity()` calls directly in existing service functions where events occur. This is simple, explicit, and matches the existing pattern where `join` activity is logged.
