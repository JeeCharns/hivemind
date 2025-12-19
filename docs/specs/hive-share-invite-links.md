# Hive Share + Invite Links Specification

## Overview

This feature implements a token-based invite link system for hives with two access modes:
- **Anyone**: Anyone with the link can join the hive
- **Invited only**: Only users whose email is in `hive_invites` (pending) can join via the link

## Database Schema

### New Table: `hive_invite_links`

```sql
CREATE TABLE public.hive_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id UUID NOT NULL REFERENCES public.hives(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  access_mode TEXT NOT NULL DEFAULT 'anyone' CHECK (access_mode IN ('anyone', 'invited_only')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hive_id)  -- One active link per hive
);
```

**Rationale**: Separate from `hive_invites` which requires `email NOT NULL` and represents per-email invitations. A shareable link is a first-class object with its own token and access mode.

### Existing Table: `hive_invites`

Continues to be used as the whitelist when `access_mode = invited_only`.

## API Endpoints

### 1. GET /api/hives/[hiveId]/share-link
**Auth**: Requires session + hive membership

**Returns**:
```json
{
  "url": "https://example.com/invite/<token>",
  "accessMode": "anyone" | "invited_only",
  "hiveName": "My Hive"
}
```

**Behavior**: Gets or creates a share link for the hive with default 'anyone' access mode.

### 2. PATCH /api/hives/[hiveId]/share-link
**Auth**: Requires session + admin role

**Body**:
```json
{
  "accessMode": "anyone" | "invited_only"
}
```

**Returns**:
```json
{
  "accessMode": "anyone" | "invited_only"
}
```

### 3. GET /api/invites/[token]/preview
**Auth**: None required (public)

**Returns**:
```json
{
  "hiveName": "My Hive",
  "accessMode": "anyone" | "invited_only"
}
```

**Usage**: Used by login page to display "Enter your email address to join {HiveName}"

**Implementation note**: This endpoint resolves the token server-side using the Supabase service role to avoid requiring public `SELECT` access on `hive_invite_links`.

### 4. POST /api/invites/[token]/accept
**Auth**: Requires session

**Returns**:
```json
{
  "hiveKey": "hive-slug-or-id",
  "message": "Successfully joined hive"
}
```

**Validation**:
- Token exists and maps to a hive
- If `accessMode = invited_only`:
  - Must have a `hive_invites` row with:
    - `hive_id` = hiveId
    - `email` = session.user.email (case-insensitive)
    - `status` = 'pending'

**Behavior**:
- Idempotent: if already a member, returns success
- Adds user to `hive_members` with role = 'member'
- If invited-only and invite exists: marks invite as 'accepted' with `accepted_at`

**Implementation note**: Because non-members cannot pass RLS on `hive_invite_links` and `hive_invites` is admin-gated, the accept flow resolves the token and invited-only checks server-side using the service role, then performs the membership upsert as the authenticated user.

**Error Codes**:
- `INVITE_NOT_FOUND` (404): Token doesn't exist
- `INVITE_FORBIDDEN` (403): Invited-only mode but email not invited
- `VALIDATION_ERROR` (400): Invalid token format

## Pages & Routes

### /invite/[token]
Public invite acceptance page.

**Flow**:
1. If not authenticated:
   - Store return URL in sessionStorage
   - Redirect to `/login?intent=join&invite=<token>`
2. If authenticated:
   - Call `POST /api/invites/[token]/accept`
   - Redirect to `/hives/:hiveKey`

### /login (Updated)
**Query Params**: `?intent=join&invite=<token>`

**Behavior**:
- Fetches `GET /api/invites/<token>/preview` to get hive name
- Shows header: "Enter your email address to join {HiveName}"
- After magic-link auth, callback redirects to returnUrl (`/invite/<token>`)

## UI Components

### HiveShareInvitePanel
**Location**: `app/hives/components/HiveShareInvitePanel.tsx`

**Props**:
```ts
{
  hiveKey: string;
  isAdmin: boolean;
  onInvitesUpdated?: () => void;
}
```

**Features**:
- Copy share link button (with toast notification)
- Access mode selector (anyone / invited-only)
  - Disabled if not admin
- Invited-only email input (conditional)
  - Comma-separated email input
  - Helper text explaining link sharing requirement
  - "Invite" button to create invite rows

**Used By**:
- Conversation Share modal
- Hive invite page (`/hives/[hiveId]/invite`)
- Create-hive wizard step 2 (future implementation)

### ConversationHeader (Updated)
**New Props**: `isAdmin?: boolean`

**Features**:
- "Share" button opens modal
- Modal shows `HiveShareInvitePanel`
- Title: "Share to {ConversationTitle}"

## Auth Flow (End-to-end)

1. User opens `/invite/<token>` (unauthenticated)
2. Page stores returnUrl in sessionStorage
3. Redirects to `/login?intent=join&invite=<token>`
4. Login page fetches preview to show hive name
5. After magic-link auth, callback returns to `/invite/<token>`
6. Page calls accept endpoint, redirects to hive

## Security Considerations

- Tokens are cryptographically strong (32 bytes, base64url encoded)
- Tokens stored in plaintext for stable links
- Email matching is case-insensitive for invite validation
- Idempotent join prevents duplicate memberships
- Admin-only access to change access mode and send invites

## Migration

**File**: `supabase/migrations/007_create_hive_invite_links.sql`

Run with: `supabase db push` or manually via Supabase Dashboard SQL Editor

### Follow-up migrations

- `supabase/migrations/008_allow_public_invite_preview.sql` temporarily allowed anonymous preview by making `hive_invite_links` publicly readable.
- `supabase/migrations/009_remove_public_invite_preview_policy.sql` removes that permissive policy; preview/accept rely on server-side lookups instead.

## Testing

Run type check and lint:
```bash
npm run typecheck
npm run lint
```

Manual QA checklist:
- [ ] Copy link shows toast and link works in incognito
- [ ] Anyone-mode: user can join after login
- [ ] Invited-only: user cannot join unless email invited
- [ ] Invited-only: after invite, user can join
- [ ] Already-member: link accept is idempotent
- [ ] Share modal opens from conversation header
- [ ] Admin can change access mode
- [ ] Non-admin cannot change access mode

## Files Changed/Created

**New Files**:
- `supabase/migrations/007_create_hive_invite_links.sql`
- `lib/hives/server/shareLinkService.ts`
- `app/api/hives/[hiveId]/share-link/route.ts`
- `app/api/invites/[token]/preview/route.ts`
- `app/api/invites/[token]/accept/route.ts`
- `app/invite/[token]/page.tsx`
- `app/hives/components/HiveShareInvitePanel.tsx`
- `app/components/toast.tsx`
- `docs/specs/hive-share-invite-links.md`

**Modified Files**:
- `lib/hives/schemas.ts` (added validation schemas)
- `app/(auth)/login/page.tsx` (join intent support)
- `app/components/conversation/ConversationHeader.tsx` (share modal)
