# Spec: Create Hive Wizard (2-Step)

## Goal

Implement a 2-step setup wizard at `/hives/new` that lets a signed-in user:

1. Enter a hive name, upload an optional logo, and choose visibility (public/private)
2. Get a shareable invite link to invite members

Entry point remains `/hives` → **Create a New Hive** → `/hives/new`.

## Non-goals

- Do not copy any backend logic from `temp/`.
- Do not change the existing `/hives/[hiveId]/invite` page behavior.
- Do not introduce new authz rules; reuse existing admin gates.

## User Journey

### Step 1: Create Hive Details

**UI Components:**

- Step indicator: "Step 1 of 2"
- Title: "Create a new Hive"
- Description: "Add your hive name and logo to get started."
- Fields:
  - **Hive Logo** (optional): Image upload using `app/components/ImageUpload.tsx` (same UX as avatar upload)
  - **Hive Name** (required): Text input, max 100 characters
  - **Hive Visibility** (required radio):
    - **Public**: "Anyone can search for and join this hive."
    - **Private**: "Only people with an invite link can join. This hive won't appear in search."
- Actions:
  - **Continue** (primary) → creates hive and proceeds to Step 2
  - **Cancel** (ghost) → returns to `/hives`

**Validation:**

- Name must be non-empty after trimming
- Logo file must be under 2MB and in supported format (JPEG, PNG, WebP, GIF)
- Visibility must be "public" or "private" (defaults to "public")

**Behavior:**

- On Continue: `POST /api/hives` with `{ name, logo?, visibility }`
- If create fails: stay on Step 1 and show error in Alert
- If create succeeds: extract `hiveKey = slug ?? id` and proceed to Step 2

### Step 2: Invite Friends (Link Sharing)

**UI Components:**

- Step indicator: "Step 2 of 2"
- Title: "Invite friends"
- Description: "Share this link to invite people to your hive."
- Content:
  - Copy link UI (reusing `HiveShareInvitePanel` in link-only mode)
  - Share link displayed with "Copy link" button
- Actions:
  - **Go to hive** (primary) → navigates to `/hives/:hiveKey`

**Behavior:**

- Uses existing share-link system to fetch/create a tokenized join URL
- No email-entry field in this step (link-only mode)
- Reuses `HiveShareInvitePanel` component with `linkOnly={true}` prop

## Routes

- **`/hives`** (list): `app/hives/HivesHome.tsx` entry point button → `/hives/new`
- **`/hives/new`** (wizard):
  - `app/hives/new/page.tsx` (server auth gate)
  - `app/hives/new/new-hive-wizard.tsx` (client wizard component)

## Backend APIs Used

### Create Hive

**Route:** `POST /api/hives`

**Implementation:** `app/api/hives/route.ts`

**Auth:** Requires authenticated session (`getServerSession()`)

**Request:**

- Preferred: `multipart/form-data`
  - `name`: string (required)
  - `logo`: file (optional, max 2MB, JPEG/PNG/WebP/GIF)
  - `visibility`: "public" | "private" (optional, default "public")
- Backward compat: `application/json`
  - `{ name: string, logo_url?: string | null, visibility?: "public" | "private" }`

**Validation:**

- `createHiveNameSchema` (name: trim, min 1, max 100)
- `hiveLogoFileSchema` (size, type)
- `hiveVisibilitySchema` (enum: "public" | "private")

**Behavior:**

- Creates hive row with unique slug and visibility
- Inserts creator as admin in `hive_members`
- Uploads logo to Supabase Storage (`logos/<hiveId>/<uuid>.<ext>`) if provided

**Response:**

- `200 OK` with `{ id, slug?, name, logo_url?, visibility }`

**Errors:**

- `401` Unauthorized
- `400` VALIDATION_ERROR / UPLOAD_FAILED
- `500` INTERNAL_ERROR

### Share Link (for Step 2)

**Route:** `GET /api/hives/[hiveId]/share-link`

**Implementation:** `app/api/hives/[hiveId]/share-link/route.ts`

**Auth:** Requires authenticated session + hive membership

**Response:**

- `200 OK` with `{ url, accessMode, hiveName }`

## Data Model

### Hive Visibility

The `hives` table includes a `visibility` column:

```sql
visibility TEXT NOT NULL DEFAULT 'public'
CHECK (visibility IN ('public', 'private'))
```

**Security expectations:**

- Private hives do not appear in join search results (`GET /api/hives/search`)
- Private hives cannot be joined via `POST /api/hives/[hiveId]/join` (returns 403 `HIVE_PRIVATE`)
- Private hives can still be joined via invite link flow (`/invite/[token]`)

## Error Handling

### Step 1 Errors

- Invalid name: Caught by client validation (Continue button disabled)
- Invalid logo: Caught by client validation (file selection rejected with alert)
- Create API error: Show error in Alert, stay on Step 1

### Step 2 Errors

- Share link fetch error: Shown in HiveShareInvitePanel Alert

## State Management

All state managed in `NewHiveWizard` component (`app/hives/new/new-hive-wizard.tsx`):

```typescript
step: 1 | 2
name: string
logoFile: File | null
visibility: "public" | "private"
error: string | null
isSubmitting: boolean
createdHive: { id: string; slug?: string | null } | null
inFlightRef: React.MutableRefObject<boolean>
```

## Design Decisions

### Why Create Hive on Step 1?

Previously, hive creation happened in Step 3 (loading step). Now it happens at the end of Step 1:

- Simpler flow with fewer steps (2 instead of 3)
- Immediate feedback on creation success/failure
- Step 2 can fetch the share link for the already-created hive

### Why Link-Only in Step 2?

- Matches the spec requirement to replace email entry with link sharing
- Reuses existing `HiveShareInvitePanel` component with `linkOnly={true}` prop
- Simpler UX: copy link and share however you prefer

### Why Public Default?

- Backward compatible with existing hives
- Most hives are intended to be discoverable
- Users who want privacy must explicitly choose it

## Implementation Notes

- Business logic: `lib/hives/server/createHive.ts` (accepts visibility)
- Validation schemas: `lib/hives/schemas.ts` (includes `hiveVisibilitySchema`)
- Join filtering: `lib/hives/server/joinHive.ts` (blocks private hive joins)
- Search filtering: `lib/hives/server/searchJoinableHives.ts` (only returns public hives)
- Share panel: `app/hives/components/HiveShareInvitePanel.tsx` (supports `linkOnly` prop)

## Testing Coverage

### Unit/Integration Tests

- **`app/tests/api/hives-create.test.ts`**: Hive creation API
  - Unauthenticated rejection
  - Invalid JSON body
  - Valid JSON creation (with default public visibility)
  - Valid JSON creation with private visibility
  - Valid multipart creation with private visibility
  - Invalid logo file type
  - Invalid visibility defaults to public
- **`app/tests/api/hives-join.test.ts`**: Join API
  - Private hive rejection with 403 HIVE_PRIVATE

### Manual Testing Scenarios

1. **Happy path (public):** Create public hive with name + logo → Step 2 shows link → Go to hive
2. **Happy path (private):** Create private hive → Step 2 shows link → Go to hive
3. **Skip logo:** Create hive with name only (no logo) → Success
4. **Hive creation fails:** API error in Step 1 → Stay on Step 1 with error in Alert
5. **Cancel from Step 1:** Click Cancel → Return to `/hives`
6. **Copy link:** In Step 2, copy link → Toast confirmation
7. **Search excludes private:** Create private hive → Search for it → Not found
8. **Join blocked for private:** Try to join private hive directly → 403 error

## Acceptance Criteria

- From `/hives`, **Create a New Hive** opens `/hives/new`
- Step 1: Collect name + optional logo + visibility, create hive, show errors if any
- Step 2: Show shareable link with copy button, "Go to hive" navigates to hive
- Unauthorized users redirected to `/login` when visiting `/hives/new`
- Private hives don't appear in search
- Private hives can't be joined directly (must use invite link)
- All inputs preserved on error (stay on Step 1)
- No double-submit issues (idempotent orchestration via `inFlightRef`)
