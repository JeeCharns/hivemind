# Supabase Realtime Setup for Analysis Updates

This document describes the Supabase Realtime configuration required for push-based analysis status updates.

## Overview

The Understand feature uses Supabase Realtime to push analysis updates to the browser instead of relying solely on polling. This provides:

- Immediate UI updates when analysis completes
- Reduced server load (status polling runs as a low-frequency safety net)
- Better user experience with live status updates

## Architecture

### Event Flow

1. **Worker updates database**
   - `conversations.analysis_status` changes (embedding → analyzing → ready)
   - `conversation_themes` rows inserted
   - `conversation_responses` updated with `x_umap`, `y_umap`, `cluster_index`

2. **Supabase Realtime broadcasts changes**
   - Postgres change events filtered by RLS policies
   - Only members of the conversation's hive receive events

3. **Browser receives events**
   - Client hook (`useConversationAnalysisRealtime`) debounces events
   - Fetches fresh data via `GET /api/conversations/[conversationId]/understand`
   - UI re-renders with new themes/coordinates

## Required Configuration

### 1. Enable Realtime Replication

In Supabase Dashboard → Database → Replication, enable publication for these tables:

```sql
-- Enable replication for analysis tables
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_themes;

## Profile avatars (Storage)

User profile photos are stored in the Supabase Storage bucket `user-avatars`.

Optional env overrides:

- `SUPABASE_AVATAR_BUCKET`
- `NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET`
-- Optional: conversation_responses (can be chatty, usually not needed)
```

Or via SQL:

```sql
-- Check current replication status
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';

-- Add tables to replication
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_themes;
```

### 2. Row Level Security (RLS) Policies

Realtime respects RLS policies. Events are only sent if the user has SELECT permission.

**Required policies:**

#### conversations table

```sql
-- Policy: Allow hive members to view conversations in their hive
CREATE POLICY "Hive members can view conversations"
ON conversations FOR SELECT
USING (
  hive_id IN (
    SELECT hive_id
    FROM hive_members
    WHERE user_id = auth.uid()
  )
);
```

#### conversation_themes table

```sql
-- Policy: Allow hive members to view themes for conversations in their hive
CREATE POLICY "Hive members can view conversation themes"
ON conversation_themes FOR SELECT
USING (
  conversation_id IN (
    SELECT c.id
    FROM conversations c
    INNER JOIN hive_members hm ON c.hive_id = hm.hive_id
    WHERE hm.user_id = auth.uid()
  )
);
```

#### conversation_responses table (optional)

```sql
-- Policy: Allow hive members to view responses
CREATE POLICY "Hive members can view responses"
ON conversation_responses FOR SELECT
USING (
  conversation_id IN (
    SELECT c.id
    FROM conversations c
    INNER JOIN hive_members hm ON c.hive_id = hm.hive_id
    WHERE hm.user_id = auth.uid()
  )
);
```

### 3. Verify RLS Configuration

Run this query as a hive member to verify RLS policies work:

```sql
-- Test as authenticated user (set auth.uid() context first)
SELECT
  id,
  analysis_status,
  analysis_error
FROM conversations
WHERE id = '<test-conversation-id>';

-- Should return the conversation if user is a member
-- Should return empty if user is not a member
```

## Client Implementation

### Hook: useConversationAnalysisRealtime

Location: [lib/conversations/react/useConversationAnalysisRealtime.ts](../lib/conversations/react/useConversationAnalysisRealtime.ts)

**Subscriptions:**

1. **conversations** table UPDATE events
   - Filter: `id=eq.<conversationId>`
   - Triggers refresh when `analysis_status` changes

2. **conversation_themes** table INSERT/UPDATE/DELETE events
   - Filter: `conversation_id=eq.<conversationId>`
   - Triggers refresh when themes are generated

**Debouncing:**

- Default 500ms debounce to collapse burst updates
- Theme inserts + status update often happen together

**Polling safety net:**

- `useAnalysisStatus` runs while analysis is in progress to prevent silent stalls
- Polling interval: 5 seconds when realtime is unavailable, 15 seconds when connected (lightweight status check)

### Component: UnderstandViewContainer

Location: [app/components/conversation/UnderstandViewContainer.tsx](../app/components/conversation/UnderstandViewContainer.tsx)

**Behavior:**

- Subscribes to realtime when `responseCount >= 20` and analysis in progress
- Shows connection status indicator ("● Live updates enabled")
- Uses a status polling safety net (faster when realtime errors, slower when connected)
- Fetches fresh data via API when events arrive

## Testing

### Manual Testing

1. **Enable realtime subscription**
   - Create conversation with 20+ responses
   - Trigger analysis manually
   - Open browser DevTools → Console
   - Look for `[realtime] subscription status: SUBSCRIBED`

2. **Verify events arrive**
   - Watch console for `[realtime] conversations update:` logs
   - UI should update automatically when analysis completes

3. **Test RLS**
   - As user NOT in hive: no events should arrive
   - As user IN hive: events should arrive

### Debugging

**No events arriving:**

1. Check replication is enabled:

   ```sql
   SELECT * FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
   AND tablename IN ('conversations', 'conversation_themes');
   ```

2. Check RLS policies exist:

   ```sql
   SELECT tablename, policyname, cmd
   FROM pg_policies
   WHERE tablename IN ('conversations', 'conversation_themes');
   ```

3. Check browser console for:
   - `[realtime] subscription status:` should show `SUBSCRIBED`
   - `[realtime] conversations update:` should appear when analysis updates

**Connection errors:**

1. Check Supabase URL/publishable key are correct
2. Verify user is authenticated (`auth.uid()` should return user ID)
3. Check browser network tab for WebSocket connection
4. Status polling should continue if realtime fails (more frequent interval)

## Performance Considerations

### Debouncing

The hook debounces refresh calls by 500ms. This means:

- Multiple theme inserts + 1 status update = 1 API call
- Worker writes complete quickly (< 500ms between writes) = collapsed into single refresh

### Connection Lifecycle

- Channel created when `enabled = true`
- Channel cleaned up on unmount or when `conversationId` changes
- Reconnection is automatic via Supabase client

### Scaling

Realtime connections scale with:

- Number of concurrent users on Understand tab
- Each user = 1 WebSocket connection
- Supabase handles connection pooling

For high-traffic scenarios:

- Consider limiting subscriptions to active analysis only
- Unsubscribe when analysis completes (already implemented)
- Monitor Supabase realtime usage in dashboard

## Rollout Plan

1. **Phase 1: Deploy with safety net** (current)
   - Realtime is primary mechanism
   - Status polling runs as a safety net (faster when realtime fails)
   - Both `analysis-status` endpoint and realtime coexist

2. **Phase 2: Monitor** (1-2 weeks)
   - Track realtime connection success rate
   - Monitor safety-net polling usage
   - Verify RLS policies prevent unauthorized access

3. **Phase 3: Optimize** (optional)
   - Consider removing the safety-net polling if realtime is reliable
   - Consider deprecating `analysis-status` endpoint
   - Add metrics/logging for realtime performance

## Troubleshooting

### Issue: "Realtime unavailable" message in UI

**Causes:**

- Replication not enabled for tables
- RLS policies blocking SELECT
- Network/firewall blocking WebSocket

**Resolution:**

1. Verify replication enabled (see Configuration section)
2. Test RLS policies with manual queries
3. Check browser console for specific errors
4. Status polling should work if realtime fails

### Issue: UI not updating despite events

**Causes:**

- Debounce too long (events collapsed)
- API fetch failing (check network tab)
- State not updating (React issue)

**Resolution:**

1. Reduce `debounceMs` to 250ms for testing
2. Check API response in network tab
3. Add console.log in `fetchUnderstandData` to verify calls

### Issue: Too many API calls

**Causes:**

- Debounce too short
- Events firing for every response update

**Resolution:**

1. Increase `debounceMs` to 750ms or 1000ms
2. Remove `conversation_responses` subscription (often too chatty)
3. Only subscribe to `conversations` + `conversation_themes`

## Security

### RLS Enforcement

Realtime respects RLS. If a user shouldn't see a row, they won't receive events.

**Testing RLS:**

```sql
-- As user NOT in hive
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<non-member-user-id>"}';

SELECT * FROM conversations WHERE id = '<conversation-id>';
-- Should return empty

-- Events will NOT be sent to this user
```

### Authentication

- Supabase client uses publishable key + user session
- `auth.uid()` in RLS policies checks authenticated user
- Unauthenticated users receive no events (RLS blocks)

## Live Feed Broadcast Channel

The Listen tab uses a **Supabase Broadcast channel** for real-time response updates. This is different from postgres_changes and optimized for high-concurrency scenarios (200+ concurrent users).

### Why Broadcast Instead of postgres_changes?

| Aspect        | postgres_changes                | Broadcast                            |
| ------------- | ------------------------------- | ------------------------------------ |
| Payload       | Raw table columns only          | Complete LiveResponse with user data |
| Client action | Must refetch to get full data   | Append directly, no API call         |
| At 200 users  | 40,000 API calls per submission | 1 API call (submitter only)          |

### Architecture

```
User submits → API inserts → API broadcasts complete LiveResponse → Clients append
```

### Implementation

**Server-side broadcast:**

- Location: [lib/conversations/server/broadcastResponse.ts](../lib/conversations/server/broadcastResponse.ts)
- Called from: `POST /api/conversations/[conversationId]/responses` after successful insert
- Channel name: `feed:{conversationId}`
- Event: `new_response`
- Fire-and-forget: errors logged but don't fail the API

**Client-side subscription:**

- Location: [lib/conversations/react/useConversationFeedRealtime.ts](../lib/conversations/react/useConversationFeedRealtime.ts)
- Subscribes to broadcast channel for new responses
- Subscribes to postgres_changes for like updates (debounced)
- Reports connection status for UI indicator

**Background sync:**

- 30-second interval when tab visible
- Ensures eventual consistency for missed broadcasts
- Uses `silentRefresh()` (no loading state)

### Configuration

**No database configuration required** - Broadcast channels don't use postgres replication or RLS.

**Environment variables required:**

- `NEXT_PUBLIC_SUPABASE_URL` - For client subscription
- `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) - For server-side broadcast

### Testing

1. Open Listen tab in two browsers
2. Submit a response in one
3. Verify it appears instantly in the other (no loading flash)
4. Check browser console for connection status

### Troubleshooting

**Responses not appearing in real-time:**

1. Check browser console for WebSocket errors
2. Verify `SUPABASE_SECRET_KEY` is set in server environment
3. Background sync at 30s ensures eventual consistency

**Duplicate responses:**

- `appendResponse()` deduplicates by ID
- Submitter has optimistic update, broadcast is ignored

## References

- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime)
- [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Postgres Replication](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [useConversationAnalysisRealtime Hook](../lib/conversations/react/useConversationAnalysisRealtime.ts)
- [useConversationFeedRealtime Hook](../lib/conversations/react/useConversationFeedRealtime.ts)
