# Supabase Realtime Setup for Analysis Updates

This document describes the Supabase Realtime configuration required for push-based analysis status updates.

## Overview

The Understand feature uses Supabase Realtime to push analysis updates to the browser instead of polling. This provides:
- Immediate UI updates when analysis completes
- Reduced server load (no polling endpoints hit)
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

**Fallback:**
- If realtime connection fails (`status === "error"`), falls back to polling via `useAnalysisStatus`
- Polling interval: 5 seconds

### Component: UnderstandViewContainer

Location: [app/components/conversation/UnderstandViewContainer.tsx](../app/components/conversation/UnderstandViewContainer.tsx)

**Behavior:**
- Subscribes to realtime when `responseCount >= 20` and analysis in progress
- Shows connection status indicator ("● Live updates enabled")
- Falls back to polling if realtime errors
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

1. Check Supabase URL/anon key are correct
2. Verify user is authenticated (`auth.uid()` should return user ID)
3. Check browser network tab for WebSocket connection
4. Fallback polling should activate if realtime fails

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

1. **Phase 1: Deploy with fallback** (current)
   - Realtime is primary mechanism
   - Polling fallback if realtime fails
   - Both `analysis-status` endpoint and realtime coexist

2. **Phase 2: Monitor** (1-2 weeks)
   - Track realtime connection success rate
   - Monitor fallback polling usage
   - Verify RLS policies prevent unauthorized access

3. **Phase 3: Optimize** (optional)
   - Remove polling fallback if realtime is reliable
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
4. Fallback polling should work if realtime fails

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

- Supabase client uses anon key + user session
- `auth.uid()` in RLS policies checks authenticated user
- Unauthenticated users receive no events (RLS blocks)

## References

- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime)
- [Postgres Replication](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [useConversationAnalysisRealtime Hook](../lib/conversations/react/useConversationAnalysisRealtime.ts)
