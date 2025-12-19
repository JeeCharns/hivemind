# Hive Share + Invite Links - QA Testing Guide

## Pre-requisites

1. **Database migrations applied** (in order):
   - `007_create_hive_invite_links.sql` - Creates the invite links table
   - `008_allow_public_invite_preview.sql` - Allows public preview access (required for login flow)

   Apply via Supabase Dashboard → SQL Editor, or if using local Supabase CLI:
   ```bash
   supabase db push
   ```

2. **Application running**:
   ```bash
   npm run dev
   ```

## Test Scenarios

### 1. Share Modal - Anyone Mode

**Setup**: Create/join a hive as a member (not admin)

**Steps**:
1. Navigate to any conversation in the hive
2. Click the "Share" button in the conversation header
3. Verify modal opens with title "Share to [Conversation Title]"
4. Verify "Copy link" button is visible
5. Click "Copy link"
6. Verify green toast appears: "Link copied"
7. Verify access mode shows "Anyone" (selected)
8. Verify access mode radio buttons are disabled (non-admin)
9. Verify helper text: "Only admins can change access settings."
10. Click "Done" to close modal

**Expected**: Member can view and copy link but cannot change settings

---

### 2. Share Modal - Admin Access Mode Change

**Setup**: Be an admin of a hive

**Steps**:
1. Open share modal from any conversation
2. Verify access mode radio buttons are enabled
3. Select "Invited only"
4. Verify toast appears: "Access mode updated"
5. Verify conditional email input section appears
6. Verify helper text: "You still need to copy and share the link..."
7. Switch back to "Anyone"
8. Verify email input section disappears
9. Verify toast appears: "Access mode updated"

**Expected**: Admin can change access modes

---

### 3. Invite Emails (Invited-Only Mode)

**Setup**: Set access mode to "Invited only" as admin

**Steps**:
1. Enter email addresses (comma-separated): `test1@example.com, test2@example.com`
2. Verify helper text shows: "(2 entered)"
3. Click "Invite 2 people"
4. Verify toast appears: "2 invite(s) sent"
5. Verify email input clears

**Error Cases**:
- Enter 0 emails → "Invite 0 people" button is disabled
- Enter 11 emails → Button disabled, shows validation error
- Invalid email format → (future: show validation)

**Expected**: Emails are added to whitelist, toast confirmation shown

---

### 4. Accept Invite - Anyone Mode (Unauthenticated)

**Steps**:
1. Copy invite link from share modal
2. Open link in incognito browser: `/invite/[token]`
3. Verify redirect to `/login?intent=join&invite=[token]`
4. Verify login header shows: "Enter your email address to join [HiveName]"
5. Enter email and request magic link
6. Click magic link in email
7. Verify redirect back to `/invite/[token]`
8. Verify "Joining Hive..." spinner shows
9. Verify redirect to `/hives/[hiveKey]`
10. Verify user is now a member

**Expected**: Seamless join flow with custom login header

---

### 5. Accept Invite - Anyone Mode (Already Authenticated)

**Steps**:
1. Login to application
2. Open invite link: `/invite/[token]`
3. Verify immediate redirect to hive (no login required)
4. Verify user is added as member

**Expected**: Skip login, immediate join

---

### 6. Accept Invite - Invited-Only Mode (Email on Whitelist)

**Setup**:
- Set access mode to "Invited only"
- Add `testuser@example.com` to whitelist

**Steps**:
1. Logout
2. Open invite link in incognito
3. Login with `testuser@example.com` (the whitelisted email)
4. Verify successful join
5. Check database: `hive_invites` row status should be 'accepted'

**Expected**: Whitelisted email can join

---

### 7. Accept Invite - Invited-Only Mode (Email NOT on Whitelist)

**Setup**:
- Set access mode to "Invited only"
- Do NOT add `unauthorized@example.com` to whitelist

**Steps**:
1. Logout
2. Open invite link
3. Login with `unauthorized@example.com`
4. Verify error message: "This invite is restricted to invited emails only..."
5. Verify user is NOT added to hive

**Expected**: Non-whitelisted email cannot join

---

### 8. Idempotent Join

**Setup**: Already be a member of the hive

**Steps**:
1. Open invite link for hive you're already in
2. Verify redirect to hive homepage (no error)
3. Verify membership unchanged

**Expected**: No duplicate membership error

---

### 9. Invalid Token

**Steps**:
1. Navigate to `/invite/invalid-token-12345`
2. Verify error: "Invalid invite link" or "Invite not found"

**Expected**: Graceful error handling

---

### 10. Share Link Persistence

**Steps**:
1. Open share modal and copy link
2. Close modal
3. Reopen share modal
4. Verify same link is shown (token hasn't changed)
5. Verify access mode persists

**Expected**: One stable link per hive

---

## Database Verification

### Check invite link creation:
```sql
SELECT * FROM hive_invite_links WHERE hive_id = '[your-hive-id]';
```

### Check invite email rows:
```sql
SELECT * FROM hive_invites
WHERE hive_id = '[your-hive-id]'
AND status = 'pending';
```

### Check membership:
```sql
SELECT * FROM hive_members
WHERE hive_id = '[your-hive-id]'
AND user_id = '[new-user-id]';
```

---

## Automated Tests

Test placeholders created in `app/tests/api/hives-share-link.test.ts`.

To implement full tests:
1. Set up auth mocking (see existing tests in `app/tests/api/`)
2. Use Supabase test client
3. Implement each test case

---

## Known Limitations

1. **No email delivery**: Invite emails are added to whitelist but not sent via email
2. **One link per hive**: Updating access mode affects the single shared link
3. **No link expiration**: Tokens remain valid indefinitely
4. **No token rotation**: Same token used for life of hive

---

## Rollback Plan

If issues are found:

1. **Disable feature**: Remove "Share" button from ConversationHeader
2. **Revert migration**:
   ```sql
   DROP TABLE IF EXISTS public.hive_invite_links CASCADE;
   ```
3. **Revert code**:
   ```bash
   git revert [commit-hash]
   ```

---

## Success Criteria

✅ All 10 test scenarios pass
✅ No TypeScript errors: `npm run typecheck`
✅ No ESLint errors in new code
✅ Database migration applied successfully
✅ Toast notifications work correctly
✅ Error messages are user-friendly
✅ Access control works (admin vs member)
✅ Both access modes (anyone/invited-only) work correctly
