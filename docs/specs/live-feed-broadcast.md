# Live Feed Broadcast Channel Spec

## Problem Statement

When multiple users submit responses concurrently in the Listen tab, the live feed enters a loading state on each submission. This happens because:

1. Supabase Realtime fires an `INSERT` event on `conversation_responses`
2. The event handler calls `refresh()` which sets `isLoadingFeed = true`
3. The UI shows skeleton loaders, replacing the entire feed content
4. At scale (200+ concurrent users), this creates:
   - **40,000+ API requests** in burst scenarios (200 users × 200 submissions)
   - Constant visual flickering making the feed unreadable
   - Database load from repeated JOINs for user profiles and like counts

## Solution Overview

Replace the `postgres_changes` subscription with a **Supabase Broadcast channel** that sends complete `LiveResponse` objects. The API broadcasts the fully-hydrated response (including user profile data) after successful insertion, eliminating the need for clients to refetch.

### Architecture

```
┌─────────────────┐    POST /responses    ┌─────────────────┐
│   User A        │ ───────────────────── │   API Route     │
│   (submitter)   │                       │                 │
└─────────────────┘                       │  1. Insert DB   │
                                          │  2. Broadcast   │
┌─────────────────┐                       └────────┬────────┘
│   User B        │                                │
│   (viewer)      │ ◄──── Broadcast Channel ───────┤
└─────────────────┘        (LiveResponse)          │
                                                   │
┌─────────────────┐                                │
│   User C        │ ◄──────────────────────────────┘
│   (viewer)      │
└─────────────────┘
```

### Key Design Decisions

1. **Broadcast over postgres_changes**: Broadcast channels send arbitrary JSON payloads, allowing us to include the complete `LiveResponse` with user data. postgres_changes only sends raw table columns.

2. **Server-initiated broadcast**: The API route broadcasts after successful DB insert, ensuring consistency (no broadcast without persist).

3. **Retain postgres_changes for likes**: Like updates are less frequent and don't require user profile data. Keep the existing subscription but make it silent (no loading state).

4. **Debounced background sync**: A low-frequency background refresh ensures eventual consistency for edge cases (missed broadcasts, like count drift).

## Detailed Design

### 1. New Broadcast Service

**File:** `lib/conversations/server/broadcastResponse.ts`

**Purpose:** Broadcast a `LiveResponse` to all subscribers of a conversation's feed channel.

**Interface:**

```typescript
interface BroadcastResponseInput {
  conversationId: string;
  response: LiveResponse;
}

function broadcastResponse(input: BroadcastResponseInput): Promise<void>;
```

**Behavior:**

- Uses Supabase server client to broadcast to channel `feed:{conversationId}`
- Event type: `new_response`
- Payload: Complete `LiveResponse` object
- Fire-and-forget: Errors are logged but don't fail the API response
- No RLS filtering needed (broadcast channels don't use RLS; membership is validated on subscription)

**Why server-side broadcast:**

- Ensures broadcast only happens after successful DB write
- Server has access to service role key for reliable broadcasting
- Avoids exposing broadcast capability to clients

### 2. API Route Changes

**File:** `app/api/conversations/[conversationId]/responses/route.ts`

**Changes to POST handler:**

1. After successful insert and response formatting (existing logic)
2. Call `broadcastResponse({ conversationId, response })`
3. Return response to submitter (unchanged)

**Error handling:**

- Broadcast failure should NOT fail the API response
- Log broadcast errors for monitoring
- The submitter's optimistic update ensures they see their response
- Other users will get the response via background sync if broadcast fails

### 3. New Client Hook: useConversationFeedRealtime

**File:** `lib/conversations/react/useConversationFeedRealtime.ts`

**Purpose:** Subscribe to the broadcast channel and append new responses to the feed.

**Interface:**

```typescript
interface UseConversationFeedRealtimeOptions {
  conversationId: string;
  enabled?: boolean;
  onNewResponse: (response: LiveResponse) => void;
  onLikeUpdate?: () => void; // Trigger silent refresh for like changes
}

interface UseConversationFeedRealtimeResult {
  status: RealtimeStatus; // "connecting" | "connected" | "error" | "disconnected"
  error?: string;
}
```

**Subscriptions:**

1. **Broadcast channel** (`feed:{conversationId}`)
   - Event: `new_response`
   - Handler: Call `onNewResponse(payload.response)`
   - No loading state triggered

2. **postgres_changes** (retained, modified)
   - Table: `response_likes`
   - Events: `INSERT`, `DELETE`
   - Handler: Call `onLikeUpdate()` (debounced, triggers silent refresh)
   - Filter: Only responses in this conversation (via JOIN or post-filter)

**Connection management:**

- Subscribe on mount when `enabled = true`
- Unsubscribe on unmount or when `conversationId` changes
- Report connection status for UI indicator

### 4. Updated useConversationFeed Hook

**File:** `lib/conversations/react/useConversationFeed.ts`

**New capabilities:**

1. **`appendResponse(response: LiveResponse)`**: Add a response to the feed without triggering loading state
   - Deduplicates by `response.id` (handles case where submitter already has it via optimistic update)
   - Prepends to feed array (newest first)

2. **`silentRefresh()`**: Refresh feed data without setting `isLoadingFeed = true`
   - Used for background sync and like count updates
   - Merges new data with existing (preserves scroll position intent)

3. **`hasLoadedOnce` flag**: Track whether initial load completed
   - Used to distinguish "initial load" from "refresh"
   - Prevents showing skeletons on background refreshes

**Updated interface:**

```typescript
interface UseConversationFeedReturn {
  feed: LiveResponse[];
  isLoadingFeed: boolean;
  isSubmitting: boolean;
  error: string | null;
  submit: (input: SubmitResponseInput) => Promise<void>;
  toggleLike: (responseId: string) => Promise<void>;
  refresh: () => Promise<void>;
  // New
  appendResponse: (response: LiveResponse) => void;
  silentRefresh: () => Promise<void>;
  hasLoadedOnce: boolean;
}
```

### 5. Updated ListenView Component

**File:** `app/components/conversation/ListenView.tsx`

**Changes:**

1. **Replace subscription setup:**
   - Remove existing `postgres_changes` subscription for `conversation_responses`
   - Add `useConversationFeedRealtime` hook with:
     - `onNewResponse`: calls `appendResponse`
     - `onLikeUpdate`: calls debounced `silentRefresh`

2. **Background sync interval:**
   - Add `useEffect` with 30-second interval calling `silentRefresh`
   - Only runs when tab is visible (use `document.visibilityState`)
   - Ensures eventual consistency for missed broadcasts

3. **Loading state logic:**
   - Show skeletons only when `isLoadingFeed && !hasLoadedOnce`
   - During background refreshes, feed remains visible and interactive

4. **Connection status indicator (optional):**
   - Show subtle "● Live" indicator when broadcast channel is connected
   - Show "Reconnecting..." if connection drops

### 6. Database/Realtime Configuration

**No schema changes required.**

**Realtime configuration:**

- Broadcast channels don't require replication setup (they're not tied to postgres_changes)
- Existing RLS policies remain unchanged
- Channel authorization happens at subscription time via Supabase auth

### 7. Type Definitions

**File:** `lib/conversations/domain/listen.types.ts`

**New types:**

```typescript
/**
 * Broadcast event payload for new responses
 */
interface FeedBroadcastPayload {
  type: "new_response";
  response: LiveResponse;
}

/**
 * Channel naming convention
 */
type FeedChannelName = `feed:${string}`; // feed:{conversationId}
```

## Edge Cases and Error Handling

### 1. Submitter receives their own broadcast

- `appendResponse` deduplicates by `id`
- Optimistic update wins (already in feed)
- Broadcast is silently ignored for that response

### 2. Broadcast fails but DB write succeeds

- Submitter sees their response (optimistic update)
- Other users get it via 30-second background sync
- Log error for monitoring, but don't alert user

### 3. User joins mid-session

- Initial `loadFeed()` fetches all existing responses
- Then subscribes to broadcast for new ones
- No gap in data

### 4. Network disconnect/reconnect

- Supabase client handles reconnection automatically
- `silentRefresh` on reconnect ensures no missed responses
- Connection status shown to user

### 5. Out-of-order delivery

- Responses have `createdAt` timestamp
- Feed is sorted by `createdAt` descending
- `appendResponse` can re-sort if needed (or just prepend, accepting minor ordering variance)

### 6. Like count drift

- Broadcast doesn't include like data (likes are user-specific)
- postgres_changes on `response_likes` triggers `silentRefresh`
- 30-second background sync catches any drift

## Testing Strategy

### Unit Tests

1. **broadcastResponse service**
   - Broadcasts correct payload structure
   - Handles Supabase client errors gracefully
   - Logs errors without throwing

2. **useConversationFeedRealtime hook**
   - Subscribes to correct channel name
   - Calls `onNewResponse` with parsed payload
   - Reports connection status correctly
   - Cleans up subscription on unmount

3. **useConversationFeed hook (updated)**
   - `appendResponse` deduplicates by id
   - `appendResponse` prepends new responses
   - `silentRefresh` doesn't set `isLoadingFeed`
   - `hasLoadedOnce` becomes true after first load

### Integration Tests

1. **API broadcast integration**
   - POST creates response AND broadcasts
   - Broadcast contains correct `LiveResponse` structure
   - Broadcast failure doesn't fail API response

2. **End-to-end flow**
   - User A submits → User B sees response without loading state
   - Multiple rapid submissions don't cause loading flicker
   - Background sync catches missed broadcasts

### Manual Testing Checklist

- [ ] Submit response, verify it appears for other users instantly
- [ ] Verify no loading skeleton flash on new responses
- [ ] Disconnect network, reconnect, verify sync resumes
- [ ] Open 10 tabs, submit rapidly, verify no duplicate responses
- [ ] Check console for broadcast errors (should be none in happy path)
- [ ] Verify like counts update (may have slight delay, acceptable)

## Migration Plan

### Phase 1: Deploy broadcast infrastructure (non-breaking)

1. Add `broadcastResponse` service
2. Update API route to broadcast after insert
3. No client changes yet - existing behavior continues

### Phase 2: Deploy client changes

1. Add `useConversationFeedRealtime` hook
2. Update `useConversationFeed` with new methods
3. Update `ListenView` to use new subscription pattern
4. Remove old `postgres_changes` subscription for responses

### Phase 3: Monitor and tune

1. Monitor broadcast success rate
2. Adjust background sync interval if needed (30s → 15s or 60s)
3. Consider removing `response_likes` postgres_changes if too chatty

## Performance Considerations

### At 200 concurrent users:

| Metric                          | Before (refresh on each event) | After (broadcast append) |
| ------------------------------- | ------------------------------ | ------------------------ |
| API calls per submission        | 200 (all users refetch)        | 1 (submitter only)       |
| Database queries per submission | 200 (with JOINs)               | 1 (insert + select)      |
| Network payload per user        | Full feed (~50KB)              | Single response (~500B)  |
| UI re-renders                   | Full list re-render            | Single item append       |

### Broadcast channel limits:

- Supabase broadcast has no message size limit (practical limit ~1MB)
- `LiveResponse` is ~500 bytes - well within limits
- Channel subscriptions scale with Supabase plan

## Files to Create/Modify

### New Files

| File                                                     | Purpose                       |
| -------------------------------------------------------- | ----------------------------- |
| `lib/conversations/server/broadcastResponse.ts`          | Server-side broadcast service |
| `lib/conversations/react/useConversationFeedRealtime.ts` | Client subscription hook      |

### Modified Files

| File                                                        | Changes                                                |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| `app/api/conversations/[conversationId]/responses/route.ts` | Add broadcast after insert                             |
| `lib/conversations/react/useConversationFeed.ts`            | Add `appendResponse`, `silentRefresh`, `hasLoadedOnce` |
| `lib/conversations/domain/listen.types.ts`                  | Add broadcast payload types                            |
| `app/components/conversation/ListenView.tsx`                | Use new realtime hook, update loading logic            |
| `docs/feature-map.md`                                       | Document new broadcast pattern                         |
| `docs/realtime-setup.md`                                    | Add broadcast channel documentation                    |

### Test Files

| File                                                                     | Purpose                 |
| ------------------------------------------------------------------------ | ----------------------- |
| `lib/conversations/server/__tests__/broadcastResponse.test.ts`           | Broadcast service tests |
| `lib/conversations/react/__tests__/useConversationFeedRealtime.test.tsx` | Subscription hook tests |
| `lib/conversations/react/__tests__/useConversationFeed.test.tsx`         | Update existing tests   |

## Task List

### Backend

- [ ] Create `lib/conversations/server/broadcastResponse.ts` service
- [ ] Write unit tests for broadcast service
- [ ] Update POST route to call broadcast after insert
- [ ] Test broadcast manually via Supabase dashboard

### Types

- [ ] Add `FeedBroadcastPayload` type to `listen.types.ts`
- [ ] Add channel naming type

### Client Hooks

- [ ] Create `useConversationFeedRealtime.ts` hook
- [ ] Write unit tests for realtime hook
- [ ] Update `useConversationFeed.ts` with `appendResponse`, `silentRefresh`, `hasLoadedOnce`
- [ ] Update existing `useConversationFeed` tests

### UI Component

- [ ] Update `ListenView.tsx` to use new realtime hook
- [ ] Add background sync interval (30s)
- [ ] Update loading state logic (`isLoadingFeed && !hasLoadedOnce`)
- [ ] Remove old `postgres_changes` subscription for responses
- [ ] Optional: Add connection status indicator

### Documentation

- [ ] Update `docs/feature-map.md` with broadcast pattern
- [ ] Update `docs/realtime-setup.md` with broadcast channel info
- [ ] Update `lib/conversations/README.md` with new flow

### Testing

- [ ] Manual test: single user submission flow
- [ ] Manual test: multi-user concurrent submissions
- [ ] Manual test: network disconnect/reconnect
- [ ] Manual test: like updates still work

## Open Questions

1. **Should we show a "Live" indicator?**
   - Pro: Users know updates are real-time
   - Con: Additional UI complexity
   - Recommendation: Add subtle indicator, can remove if noisy

2. **Background sync interval: 30s vs 60s?**
   - 30s: Faster recovery from missed broadcasts
   - 60s: Less server load
   - Recommendation: Start with 30s, tune based on monitoring

3. **Should broadcast include `likedByMe`?**
   - Currently: No, it's always `false` for new responses (no one has liked yet)
   - Could add: Submitter's own like status (always false for others)
   - Recommendation: Keep simple, `likedByMe: false` for all broadcast responses

## Success Criteria

1. **No loading flash**: Users can read the feed continuously while others submit
2. **Instant updates**: New responses appear within 100ms of submission
3. **Reduced server load**: API calls reduced by 99%+ during high-concurrency scenarios
4. **Graceful degradation**: If broadcast fails, background sync ensures eventual consistency
5. **Maintained accuracy**: Like counts and response data remain accurate (within 30s)
