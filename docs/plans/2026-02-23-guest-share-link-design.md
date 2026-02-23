# Guest Share Link Design

**Date:** 2026-02-23
**Status:** Completed

## Problem Statement

During workshops and live sessions, facilitators need participants to quickly join a conversation without the friction of creating an account. The existing Share button only supported inviting users to the hive (which requires signup). There was no way to give temporary, anonymous access to a specific conversation.

### Requirements

- Hive members can generate a time-limited share link for any conversation
- Anyone with the link can join the conversation as a guest — no signup required
- Multiple guests can join simultaneously, each assigned a unique "Guest N" identity
- Guests can:
  - **Listen tab:** View all responses, submit anonymous responses, like responses
  - **Understand tab:** View the cluster map and themes, submit agree/pass/disagree feedback
  - **Result tab:** View the report and consensus metrics
- Guests cannot trigger analysis or report generation (read-only for compute-heavy operations)
- Hive members can revoke the link at any time, immediately cutting off guest access
- Links expire after a configurable duration (1 day, 7 days, or 28 days)

---

## Solution Overview

A two-layer system: **share links** (created by hive members) and **guest sessions** (created automatically when a guest opens a link). Share links are stored in the database with a cryptographic token. Guest sessions are tracked via an httpOnly cookie with a hashed session token — no Supabase user is created.

### End-to-End Flow

```
Hive Member                          Guest User
─────────────                        ──────────
1. Open conversation
2. Click "Share" button
3. Select "Anonymous Link" tab
4. Pick expiry (1d/7d/28d)
5. Click "Generate anonymous link"
6. Copy URL
7. Share with participants
                                     8.  Open link (/respond/[token])
                                     9.  Layout validates session cookie
                                     10. No cookie → redirect to /api/guest/[token]/init
                                     11. Init creates guest_sessions row (Guest 1, 2, 3…)
                                     12. Sets httpOnly session cookie
                                     13. Redirects to /respond/[token]/listen
                                     14. Guest sees conversation with GuestNavbar
                                     15. Can respond, like, view understand, give feedback, view result
```

---

## Database Schema

### `conversation_share_links` Table

```sql
CREATE TABLE conversation_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_share_links_token ON conversation_share_links(token);
CREATE INDEX idx_share_links_conversation ON conversation_share_links(conversation_id);
CREATE INDEX idx_share_links_created_by ON conversation_share_links(created_by);
```

- RLS restricts all CRUD to hive members (via `hive_members` join on `conversations.hive_id`)
- One active link per conversation at a time
- `created_by` FK should specify `ON DELETE SET NULL` (requires making column nullable) to avoid blocking profile deletion
- The UNIQUE constraint on `token` already creates an implicit index — the explicit `idx_share_links_token` is redundant and should be removed

### `guest_sessions` Table

```sql
CREATE TABLE guest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES conversation_share_links(id) ON DELETE CASCADE,
  guest_number INTEGER NOT NULL,
  session_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (share_link_id, guest_number)
);

CREATE INDEX idx_guest_sessions_link ON guest_sessions(share_link_id);
CREATE INDEX idx_guest_sessions_token_hash ON guest_sessions(session_token_hash);
```

- RLS enabled with **no user policies** — server-only access via service role
- Sequential `guest_number` per share link (Guest 1, Guest 2, …)
- Guest number assignment must be **atomic** (e.g., `INSERT … SELECT COALESCE(MAX(guest_number), 0) + 1 … RETURNING`) with retry logic on unique constraint violation to handle concurrent visitors

### Existing Table Alterations

Three tables gain a nullable `guest_session_id` FK to `guest_sessions`:

| Table                    | Purpose                                 | Unique Constraint                                                                   |
| ------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------- |
| `conversation_responses` | Tracks which guest submitted a response | —                                                                                   |
| `response_likes`         | Prevents duplicate guest likes          | Partial unique on `(response_id, guest_session_id)` where not null                  |
| `response_feedback`      | Prevents duplicate guest feedback       | Partial unique on `(conversation_id, response_id, guest_session_id)` where not null |

All guest writes use a `SYSTEM_USER_ID` constant to satisfy existing NOT NULL `user_id` FK constraints. Actual attribution is via `guest_session_id`.

**Important:** The original unique constraints on `response_likes(response_id, user_id)` and `response_feedback(conversation_id, response_id, user_id)` must be made **partial** (`WHERE guest_session_id IS NULL`) so they only apply to authenticated member rows. Without this, all guest rows sharing `SYSTEM_USER_ID` collide on the original constraint, allowing only one guest to like or give feedback per response. A new migration (`043_fix_guest_unique_constraints.sql`) handles this.

---

## Architecture

### File Structure

```
lib/conversations/guest/
  ├── conversationShareLinkService.ts   # Share link CRUD (server)
  ├── guestSessionService.ts            # Session create/validate (server)
  ├── requireGuestSession.ts            # Route guard for guest API routes
  ├── schemas.ts                        # Zod validation schemas
  ├── guestApiClient.ts                 # Client-side API fetcher
  ├── guestFeedbackClient.ts            # IConversationFeedbackClient for guests
  ├── index.ts                          # Barrel exports
  └── __tests__/                        # Unit tests

app/api/guest/[token]/
  ├── init/route.ts                     # Session bootstrapper (sets cookie, wrapped in try/catch)
  ├── session/route.ts                  # GET session info (validates token matches session conversation)
  ├── responses/route.ts                # GET/POST responses (POST checks conversation phase)
  ├── responses/[responseId]/like/route.ts  # POST/DELETE like toggle
  ├── feedback/route.ts                 # POST feedback (agree/pass/disagree)
  ├── understand/route.ts               # GET understand view model (delegates to shared helper)
  └── report/route.ts                   # GET result view model (delegates to shared helper)

app/(guest)/
  ├── components/
  │   ├── GuestNavbar.tsx               # Fixed top bar with "Guest N" badge
  │   └── GuestConversationHeader.tsx   # Title, description, tab switcher
  └── respond/[token]/
      ├── layout.tsx                    # Session validation, redirects
      ├── page.tsx                      # Redirects to /listen
      ├── listen/page.tsx               # Response feed + composer
      ├── understand/page.tsx           # Cluster map wrapper
      └── result/page.tsx               # Report wrapper

app/api/conversations/[conversationId]/share-link/
  └── route.ts                          # POST/GET/DELETE share link (auth required)

app/components/conversation/
  ├── ConversationShareLinkPanel.tsx     # Share link management UI
  ├── GuestUnderstandContainer.tsx       # Understand tab wrapper for guests
  └── GuestResultContainer.tsx           # Result tab wrapper for guests

types/guest-api.ts                       # All guest-related type contracts
```

### Shared View Model Helpers

The guest `understand` and `report` routes must **not** duplicate the view model assembly logic from the authenticated routes. Instead, both guest and authenticated routes delegate to shared helpers in `lib/conversations/server/`:

- `getUnderstandViewModel(supabase, conversationId, options?)` — builds cluster map, themes, feedback counts
- `getReportViewModel(supabase, conversationId, options?)` — builds report HTML, consensus metrics, agreement summaries

Guest routes call these helpers with the admin client and pass `{ isGuest: true }` to suppress write-only fields.

### Security Model

| Layer               | Mechanism                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Token generation    | 32-byte cryptographically random token, base64url-encoded                                      |
| Session cookie      | `hivemind_guest_session` — httpOnly, secure (prod), sameSite=lax, never exposed to JS          |
| Token storage       | SHA-256 hash stored in DB; raw token only exists in the cookie                                 |
| Route guard         | `requireGuestSession()` validates: token format → session cookie → token-to-conversation match |
| DB access           | All guest DB operations use admin/service-role client (bypasses RLS)                           |
| RLS on guest tables | `guest_sessions` has RLS enabled with no policies — inaccessible to anon/authenticated roles   |
| Scope isolation     | Token-to-conversation match prevents a guest from accessing other conversations                |

### Rate Limiting

| Action          | Limit                          |
| --------------- | ------------------------------ |
| Submit response | 5 per minute per session       |
| Toggle like     | 20 per minute per session      |
| Submit feedback | 15 per minute per session      |
| GET endpoints   | 100 per minute (general)       |
| **Hard cap**    | 10 total responses per session |

### Data Freshness (Polling)

Guests do not use authenticated Supabase Realtime. Instead, data is polled:

| View       | Poll interval |
| ---------- | ------------- |
| Listen     | 10 seconds    |
| Understand | 30 seconds    |
| Result     | 30 seconds    |

---

## UI Components

### Share Link Management (Authenticated Users)

The existing **Share** button in `ConversationHeader` opens a modal with two tabs:

1. **Invite to Hive** — existing `HiveShareInvitePanel`
2. **Anonymous Link** — new `ConversationShareLinkPanel`

The Anonymous Link tab provides:

- Expiry selector (1 day / 7 days / 28 days)
- "Generate anonymous link" button
- Active link display with copy button
- Expiry warning when link is expiring soon
- "Revoke link" button

### Guest Experience

**GuestNavbar:**

- Hivemind logo (links to /login)
- "Guest N" badge with green status dot
- "Sign up" CTA button

**GuestConversationHeader:**

- Conversation title and description
- Tab switcher: Listen | Understand | Result (responsive layout)
- Blue info banner: "You're viewing this conversation as a guest. Sign up to create your own."

**Listen Tab:**

- Full response composer (500 char max) with tag selector (need/data/want/problem/risk/proposal)
- Response feed with like buttons, sort by newest/top
- "Posting as Guest (anonymous)" label

**Understand Tab:**

- Cluster map visualisation with themes (read-only)
- Agree/pass/disagree feedback on individual responses
- Cannot trigger analysis — shows appropriate messaging

**Result Tab:**

- Report HTML with consensus metrics and agreement summaries (read-only)
- Cannot trigger report generation — shows appropriate messaging

---

## API Routes

| Route                                    | Method      | Auth             | Purpose                       |
| ---------------------------------------- | ----------- | ---------------- | ----------------------------- |
| `/api/conversations/[id]/share-link`     | POST        | Session + member | Create share link             |
| `/api/conversations/[id]/share-link`     | GET         | Session + member | Fetch active share link       |
| `/api/conversations/[id]/share-link`     | DELETE      | Session + member | Revoke share link             |
| `/api/guest/[token]/init`                | GET         | None (public)    | Bootstrap session, set cookie |
| `/api/guest/[token]/session`             | GET         | Guest session    | Return session info           |
| `/api/guest/[token]/responses`           | GET         | Guest session    | List all responses            |
| `/api/guest/[token]/responses`           | POST        | Guest session    | Submit anonymous response     |
| `/api/guest/[token]/responses/[id]/like` | POST/DELETE | Guest session    | Toggle like                   |
| `/api/guest/[token]/feedback`            | POST        | Guest session    | Submit/toggle feedback        |
| `/api/guest/[token]/understand`          | GET         | Guest session    | Understand view model         |
| `/api/guest/[token]/report`              | GET         | Guest session    | Result view model             |

---

## Zod Validation Schemas

```typescript
shareLinkExpirySchema; // enum: "1d" | "7d" | "28d"
createShareLinkSchema; // { expiresIn: ShareLinkExpiry }
shareTokenSchema; // string, 32-128 chars, base64url
guestSessionCookieSchema; // string, 32-256 chars, base64url
guestCreateResponseSchema; // { text: 1-500 chars, tag?: enum }
guestSubmitFeedbackSchema; // { responseId: string, feedback: agree|pass|disagree }
```

---

## Edge Cases

- **Expired link:** Guest is redirected to `/login?error=share_link_expired`
- **Revoked link:** Guest API calls return error with `LINK_NOT_FOUND` code
- **Session for different conversation:** Layout detects mismatch and re-initialises via `/api/guest/[token]/init`. The `session` API route also validates server-side that the URL token matches the session's conversation, returning an error if they differ.
- **Closed/archived conversation:** Guest response POST rejects writes with 403 when conversation phase is `closed` or `archived`.
- **Malformed request body:** All POST routes use `request.json().catch(() => null)` + Zod safeParse, returning 400 for unparseable JSON.
- **Max responses reached:** POST returns 429 with clear message
- **Decide-type conversations:** Feedback endpoint returns 403 (feedback disabled)
- **Concurrent guests:** Atomic `guest_number` assignment (DB-level `INSERT … SELECT MAX+1`) with retry on unique constraint violation (up to 3 retries)

## Migrations

- `041_create_conversation_share_links.sql` — share links table + RLS policies
- `042_create_guest_sessions.sql` — guest sessions table + alterations to `conversation_responses`, `response_likes`, `response_feedback`
- `043_fix_guest_unique_constraints.sql` — makes original `unique_like` and `response_feedback` unique constraints partial (`WHERE guest_session_id IS NULL`) so guest rows (sharing `SYSTEM_USER_ID`) do not collide

## Tests

Service/domain tests:

- `lib/conversations/guest/__tests__/conversationShareLinkService.test.ts`
- `lib/conversations/guest/__tests__/guestSessionService.test.ts`
- `lib/conversations/guest/__tests__/requireGuestSession.test.ts`

API route tests (required per repo guidelines — happy path, 400, 401/403, 404, empty state):

- `app/tests/api/guest/session.test.ts`
- `app/tests/api/guest/init.test.ts` (planned)
- `app/tests/api/guest/responses.test.ts` (planned)
- `app/tests/api/guest/feedback.test.ts` (planned)
- `app/tests/api/guest/like.test.ts` (planned)
- `app/tests/api/guest/understand.test.ts` (planned)
- `app/tests/api/guest/report.test.ts` (planned)
