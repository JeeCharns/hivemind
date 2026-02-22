# Invite Flow Fix Design

**Date:** 2026-01-26
**Status:** Approved

## Problem Statement

Two UX issues with the invite link flow:

1. **Login page stutter:** When an unauthenticated user clicks an invite link and is redirected to login, the page briefly shows "Sign Up or Create Account" before switching to "Enter your email to join {HiveName}" after a client-side API fetch completes.

2. **Lost invite context:** The invite flow stores `returnUrl` in `sessionStorage` before redirecting to login. When the magic link opens in a new tab (common behaviour), `sessionStorage` is empty (tab-scoped), so the callback redirects to `/hives` instead of completing the invite acceptance. The user is never added to the hive.

## Solution Overview

1. **Eliminate stutter:** Pass the hive name as a query parameter from the invite page, so the login page can render the invite state immediately without an async fetch.

2. **Preserve invite context:** Replace `sessionStorage` with a secure HTTP-only cookie that persists across tabs in the same browser.

## Detailed Design

### Fix 1: Login Page Stutter

**Current flow:**

- `/invite/[token]` redirects to `/login?intent=join&invite={token}`
- Login page fires `useEffect` to fetch `/api/invites/[token]/preview`
- Page re-renders with hive name after fetch completes

**New flow:**

- `/invite/[token]` fetches preview data server-side
- Redirects to `/login?intent=join&invite={token}&hiveName={encodedHiveName}`
- Login page reads `hiveName` from URL, renders immediately

**Fallback:** If `hiveName` param is missing (e.g., old bookmarked URL), the login page falls back to fetching from the preview API.

### Fix 2: Cookie-Based Invite Context

**Cookie specification:**

- Name: `hivemind_invite_token`
- Value: The invite token
- Options:
  - `httpOnly: true` — not accessible via JavaScript (XSS protection)
  - `secure: true` — HTTPS only (in production)
  - `sameSite: 'lax'` — sent on navigation, prevents CSRF
  - `maxAge: 3600` — 1 hour expiry
  - `path: '/'` — accessible site-wide

**New flow:**

1. User visits `/invite/[token]` (unauthenticated)
2. Server validates token, fetches hive name
3. Server sets `hivemind_invite_token` cookie
4. Server redirects to `/login?intent=join&invite={token}&hiveName={name}`
5. User enters email, receives magic link
6. User clicks magic link (opens in new tab)
7. Callback page reads cookie server-side
8. If cookie exists: clear cookie, redirect to `/invite/{token}`
9. If cookie absent: existing flow (profile setup check → `/hives`)
10. `/invite/[token]` (now authenticated) calls accept API
11. User added to hive, redirected to `/hives/{slug}`

## Files to Modify

### 1. `app/invite/[token]/page.tsx`

Convert to server component:

- Fetch preview data server-side (validates token, gets hive name)
- Set `hivemind_invite_token` cookie
- Redirect unauthenticated users to login with `hiveName` param
- If authenticated, render client component that calls accept API

### 2. `app/(auth)/login/LoginPageClient.tsx`

- Read `hiveName` from `searchParams` directly
- Remove `useEffect` that fetches preview API
- Keep fetch as fallback only if `hiveName` param is missing

### 3. `app/(auth)/callback/page.tsx`

- After successful auth, read `hivemind_invite_token` cookie server-side
- If present: clear cookie, redirect to `/invite/{token}`
- If absent: continue existing logic

### 4. New file: `lib/auth/server/inviteCookie.ts`

Centralised cookie utilities:

- `setInviteCookie(token: string)` — sets the cookie
- `getInviteCookie()` — reads the cookie value
- `clearInviteCookie()` — deletes the cookie

## Edge Cases

| Case                                              | Handling                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| User has stale invite cookie from earlier attempt | Always overwrite cookie when visiting `/invite/[token]`           |
| Invalid/expired token in cookie                   | `/invite/[token]` already handles invalid tokens with error state |
| User already a member of the hive                 | Accept API uses `upsert` (idempotent), just redirects to hive     |
| Magic link opened on different device             | Falls back to `/hives`; user can click original invite link again |
| User navigates to `/login` directly (no invite)   | No cookie set, existing behaviour preserved                       |

## Security Considerations

- `httpOnly` cookie prevents JavaScript access (XSS mitigation)
- `secure` flag ensures HTTPS-only transmission in production
- `sameSite: 'lax'` prevents CSRF while allowing normal navigation
- 1-hour expiry limits exposure window
- Token is still validated server-side when accepting invite

## Trade-offs

**Accepted limitation:** If the user opens the magic link on a completely different device (not just a new tab), the cookie won't exist and they'll be redirected to `/hives`. This is an acceptable trade-off given:

- It's a rare edge case
- User can simply click the original invite link again
- Full cross-device support would require database-backed session state

## Testing Strategy

- Unit tests for `inviteCookie.ts` utilities
- Integration tests for the full invite flow (unauthenticated → auth → join)
- Manual testing of new-tab magic link scenario
