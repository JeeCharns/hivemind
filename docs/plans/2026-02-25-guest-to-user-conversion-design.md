# Guest-to-User Conversion Design

**Date:** 2026-02-25
**Status:** Implemented

## Problem Statement

When guests participate in conversations via anonymous share links, their contributions (responses, likes, feedback) are stored under a system user ID with a `guest_session_id` reference. If a guest later signs up for an account, their contributions remain orphaned — not linked to their new account. This creates a disjointed experience where users lose ownership of their prior participation.

### Requirements

- When a guest signs up (or logs in), automatically detect their active guest session
- Prompt the user to choose whether contributions appear under their name or stay anonymous
- Migrate all guest contributions (responses, likes, feedback) to the new user account
- Automatically add the user as a member of hives they participated in
- Maintain zero-friction guest onboarding (no email prompt during guest participation)

---

## Solution Overview

After OTP verification during signup/login, check for an active guest session cookie. If found, show a one-time prompt asking how contributions should be attributed, then migrate all guest data to the new user account and auto-join relevant hives.

### End-to-End Flow

```
Guest participates                    Guest signs up
─────────────────                    ──────────────
1. Opens share link                  6. Clicks "Sign up" in navbar
2. Gets assigned Guest N             7. Enters email, receives OTP
3. Submits responses/likes/feedback  8. Verifies OTP code
4. Session stored with cookie        9. System detects active guest cookie
                                    10. Prompts: "Show name or stay anonymous?"
                                    11. Migrates data:
                                        - Updates user_id on responses/likes/feedback
                                        - Sets is_anonymous based on user choice
                                        - Clears guest_session_id
                                    12. Auto-joins hive(s)
                                    13. Clears guest session cookie
                                    14. Redirects to hive dashboard
```

---

## Database Changes

### New Columns on `guest_sessions`

```sql
ALTER TABLE guest_sessions
ADD COLUMN converted_to_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN converted_at TIMESTAMPTZ;
```

These columns provide an audit trail of which guest sessions were converted and when.

### Migration Queries

All updates run in a single transaction:

```sql
-- 1. Update responses
UPDATE conversation_responses
SET user_id = $newUserId,
    guest_session_id = NULL,
    is_anonymous = $userChoice
WHERE guest_session_id = $guestSessionId;

-- 2. Update likes
UPDATE response_likes
SET user_id = $newUserId,
    guest_session_id = NULL
WHERE guest_session_id = $guestSessionId;

-- 3. Update feedback
UPDATE response_feedback
SET user_id = $newUserId,
    guest_session_id = NULL
WHERE guest_session_id = $guestSessionId;

-- 4. Mark guest session as converted
UPDATE guest_sessions
SET converted_to_user_id = $newUserId,
    converted_at = now()
WHERE id = $guestSessionId;

-- 5. Auto-join hives (for each unique hive_id from responses)
INSERT INTO hive_members (hive_id, user_id, role)
SELECT DISTINCT c.hive_id, $newUserId, 'member'
FROM conversation_responses cr
JOIN conversations c ON c.id = cr.conversation_id
WHERE cr.guest_session_id = $guestSessionId
ON CONFLICT (hive_id, user_id) DO NOTHING;
```

---

## API Changes

### New Service Function

```typescript
// lib/auth/server/migrateGuestSession.ts

interface MigrateGuestSessionParams {
  userId: string;
  guestSessionId: string;
  keepAnonymous: boolean;
}

interface MigrateGuestSessionResult {
  responsesCount: number;
  likesCount: number;
  feedbackCount: number;
  hiveIds: string[];
}

export async function migrateGuestSession(
  params: MigrateGuestSessionParams
): Promise<MigrateGuestSessionResult>
```

### New API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/guest-migration/check` | GET | Session | Check if active guest session exists, return session info |
| `/api/auth/guest-migration/execute` | POST | Session | Execute migration with `{ keepAnonymous: boolean }` |

#### GET `/api/auth/guest-migration/check`

**Response (guest session found):**
```json
{
  "hasGuestSession": true,
  "guestNumber": 5,
  "responsesCount": 3,
  "likesCount": 5,
  "feedbackCount": 8,
  "conversationTitle": "Team Retrospective"
}
```

**Response (no guest session):**
```json
{
  "hasGuestSession": false
}
```

#### POST `/api/auth/guest-migration/execute`

**Request:**
```json
{
  "keepAnonymous": false
}
```

**Response:**
```json
{
  "migrated": true,
  "responsesCount": 3,
  "likesCount": 5,
  "feedbackCount": 8,
  "joinedHiveIds": ["hive-uuid-1"],
  "redirectTo": "/hives/team-hive"
}
```

---

## UI Changes

### New Component: `GuestMigrationPrompt`

Location: `app/(auth)/components/GuestMigrationPrompt.tsx`

Modal displayed after OTP verification when a guest session is detected:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Welcome! We found your guest contributions         │
│                                                     │
│  You submitted 3 responses and 5 votes as Guest 4. │
│  How would you like them to appear?                │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ ○ Show my name                              │   │
│  │   Your contributions will display your name  │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │ ○ Keep anonymous                            │   │
│  │   Your contributions will show as Anonymous  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│                              [ Continue ]           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Integration in Login Flow

Modify `app/(auth)/login/LoginPageClient.tsx`:

After `verifyOtp` succeeds:
1. Call `GET /api/auth/guest-migration/check`
2. If `hasGuestSession: true` → show `GuestMigrationPrompt` modal
3. User selects option → call `POST /api/auth/guest-migration/execute`
4. Redirect to `redirectTo` from response (the hive they participated in)

---

## Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Guest cookie exists but session expired/invalid | Skip migration prompt, proceed with normal signup |
| User already a member of the hive | Skip hive join (ON CONFLICT DO NOTHING), still migrate data |
| Migration fails mid-transaction | Rollback all changes, show error, allow retry |
| User closes modal without choosing | Default to "keep anonymous", complete migration |
| Guest session already converted | Skip migration (check `converted_to_user_id IS NULL`) |
| User logs in (not signup) with guest cookie | Same flow — check and offer migration |
| Multiple responses across different conversations | Migrate all, join all relevant hives |

### Logging

- Success: `[guest-migration] Migrated session {sessionId} to user {userId}: {responses} responses, {likes} likes, {feedback} feedback`
- Skip: `[guest-migration] Skipped - session {sessionId} already converted or invalid`
- Error: `[guest-migration] Failed to migrate session {sessionId}: {error}`

### Cookie Cleanup

Always clear `hivemind_guest_session` cookie after migration attempt (success or skip) to prevent re-prompting on subsequent logins.

---

## File Structure

### New Files

```
supabase/migrations/044_guest_session_conversion.sql
lib/auth/server/migrateGuestSession.ts
lib/auth/server/__tests__/migrateGuestSession.test.ts
app/api/auth/guest-migration/check/route.ts
app/api/auth/guest-migration/execute/route.ts
app/(auth)/components/GuestMigrationPrompt.tsx
```

### Modified Files

```
app/(auth)/login/LoginPageClient.tsx    # Integrate migration flow after OTP
lib/conversations/guest/guestSessionService.ts  # Add helper for convertible session check
```

---

## Security Considerations

- Migration endpoints require authenticated session (user must complete OTP first)
- Guest session cookie is validated server-side before migration
- Only the session matching the cookie can be migrated (no arbitrary session IDs)
- Transaction rollback on any failure prevents partial migrations

---

## Testing

### Service Tests

- `lib/auth/server/__tests__/migrateGuestSession.test.ts`
  - Migrates responses, likes, feedback correctly
  - Sets is_anonymous based on user choice
  - Auto-joins hives
  - Handles already-converted sessions
  - Rolls back on failure

### API Route Tests

- `app/tests/api/auth/guest-migration-check.test.ts`
- `app/tests/api/auth/guest-migration-execute.test.ts`

### Integration Tests

- Guest participates → signs up → sees prompt → contributions appear under name
- Guest participates → signs up → chooses anonymous → contributions show as Anonymous
- Guest with expired session → signs up → no prompt shown
