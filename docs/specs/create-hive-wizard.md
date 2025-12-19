# Spec: Create Hive Wizard (3-Step)

## Goal

Implement a 3-step setup wizard at `/hives/new` that lets a signed-in user:

1. Enter a hive name and upload an optional logo
2. Draft invite emails for up to 10 members (pre-create)
3. Create the hive + send invites in a single orchestrated flow

Entry point remains `/hives` → **Create a New Hive** → `/hives/new`.

## Non-goals

- Do not copy any backend logic from `temp/`.
- Do not change the existing `/hives/[hiveId]/invite` page behavior (wizard must reuse its logic, not fork it).
- Do not introduce new authz rules; reuse existing admin gates.

## User Journey

### Step 1: Create Hive Details

**UI Components:**
- Step indicator: "Step 1 of 3"
- Title: "Create a new Hive"
- Description: "Add your hive name and logo to get started."
- Fields:
  - **Hive Logo** (optional): Image upload using `app/components/ImageUpload.tsx` (same UX as avatar upload)
  - **Hive Name** (required): Text input, max 100 characters
- Actions:
  - **Continue** (primary) → proceeds to Step 2
  - **Cancel** (ghost) → returns to `/hives`

**Validation:**
- Name must be non-empty after trimming
- Logo file must be under 2MB and in supported format (JPEG, PNG, WebP, GIF)

**State:**
- Collects `name` and optional `logoFile` in wizard state
- Does not create the hive yet (draft state)

### Step 2: Invite Members (Pre-Create Draft)

**UI Components:**
- Step indicator: "Step 2 of 3"
- Title: "Invite members"
- Description: "Add up to 10 email addresses to invite to your hive."
- Fields:
  - **Email Addresses** (comma-separated): Text input with helper text showing count
- Actions:
  - **Continue** (primary) → proceeds to Step 3 with invites
  - **Skip** (secondary) → proceeds to Step 3 without invites
  - **Back** (ghost) → returns to Step 1

**Validation:**
- Client-side email format validation (lightweight regex)
- Maximum 10 emails enforced in UI
- Shows error if invalid email format detected

**Behavior:**
- This is a draft invite step (no API calls yet, no hiveId)
- Parses comma-separated emails: trim, ignore empties, validate format
- Stores `inviteEmails: string[]` in wizard state
- User can skip this step entirely

**Parity with Existing Invite Page:**
- Same UX patterns as `app/hives/[hiveId]/invite/page.tsx`
- Same input format and count display
- Does not show pending invites list (since hive doesn't exist yet)

### Step 3: Creating Hive... (Loading + Orchestration)

**UI Components:**
- No step indicator or title block
- Text: "Creating Hive..."
- Spinner animation centered beneath

**Orchestration Sequence:**

1. **Create Hive:**
   - `POST /api/hives` with `multipart/form-data`
   - Payload: `name` (required), `logo` file (optional)
   - On success: Extract `hiveKey = slug ?? id`
   - On failure: Return to Step 1, show error in Alert, preserve user inputs

2. **Send Invites (if any):**
   - Only if `inviteEmails.length > 0`
   - `POST /api/hives/:hiveKey/invite` with JSON body
   - Payload: `{ emails: inviteEmails }`
   - Uses existing invite route (same validation, same admin authz)
   - On failure (after hive created): Redirect to `/hives/:hiveKey/invite?error=...`
     - Hive is already created (no rollback)
     - User can retry invites from invite page

3. **Success Redirect:**
   - Navigate to `/hives/:hiveKey` (hive homepage)

**Idempotency & Safety:**
- Prevents double-submit with `inFlightRef` guard
- Disables all navigation/actions while Step 3 is running
- Step 3 cannot be entered more than once per wizard session

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
- Backward compat: `application/json`
  - `{ name: string, logo_url?: string | null }`

**Validation:**
- `createHiveNameSchema` (name: trim, min 1, max 100)
- `hiveLogoFileSchema` (size, type)

**Behavior:**
- Creates hive row with unique slug
- Inserts creator as admin in `hive_members`
- Uploads logo to Supabase Storage (`logos/<hiveId>/<uuid>.<ext>`) if provided

**Response:**
- `200 OK` with `{ id, slug?, name, logo_url? }`

**Errors:**
- `401` Unauthorized
- `400` VALIDATION_ERROR / UPLOAD_FAILED
- `500` INTERNAL_ERROR

### Invite Members

**Route:** `POST /api/hives/[hiveId]/invite`

**Implementation:** `app/api/hives/[hiveId]/invite/route.ts`

**Auth:** Requires authenticated session + admin membership

**Request:**
- `Content-Type: application/json`
- Body: `{ emails: string[] }` (min 1, max 10, valid email format)

**Validation:**
- `inviteEmailsSchema` from `lib/hives/data/hiveSchemas.ts`

**Authorization:**
- Uses `resolveHiveId` (slug/UUID support)
- Verifies user is admin of the hive

**Behavior:**
- Creates pending invite records in `hive_invites`
- Does not send emails yet (TODO in production)

**Response:**
- `200 OK` with `{ message: "Invites created", count: number }`

**Errors:**
- `401` Unauthorized
- `403` Forbidden (non-admin)
- `404` Hive not found
- `400` Invalid input

## Error Handling

### Step 1 Errors
- Invalid name: Caught by client validation (Continue button disabled)
- Invalid logo: Caught by client validation (file selection rejected with alert)
- Create API error: Caught in Step 3, return to Step 1 with error message

### Step 2 Errors
- Invalid email format: Show inline error, disable Continue button
- Too many emails (>10): Disable Continue button

### Step 3 Errors
- **Hive creation fails:** Return to Step 1 with error message, preserve all user inputs
- **Hive succeeds, invites fail:** Redirect to `/hives/:hiveKey/invite?error=...`
  - User sees error on invite page and can retry
  - Hive is not deleted (creation is permanent)

## State Management

All state managed in `NewHiveWizard` component (`app/hives/new/new-hive-wizard.tsx`):

```typescript
step: 1 | 2 | 3
name: string
logoFile: File | null
inviteEmailsText: string      // raw input
inviteEmails: string[]        // parsed (computed via useMemo)
error: string | null
isSubmitting: boolean
inFlightRef: React.MutableRefObject<boolean>
```

## Design Decisions

### Why Draft Invites in Step 2?

The invite API requires:
1. A hive to exist (hiveId parameter)
2. Admin membership verification

Since the hive doesn't exist until Step 3, Step 2 collects draft invite emails in local state. Once the hive is created in Step 3, the wizard immediately calls the invite API with the new hiveKey.

### Why Not Delete Hive on Invite Failure?

- Hive creation is a significant action (DB writes, membership creation, potential logo upload)
- Rollback adds complexity and risk of inconsistent state
- Better UX: redirect to invite page where user can retry without losing the hive
- Aligns with typical SaaS patterns (core resource creation succeeds, optional steps can be retried)

### Why Redirect with Query Param for Invite Errors?

- Simple, stateless error passing
- Invite page can read `?error=...` and display it
- Avoids complex error state management across routes
- User lands on the correct page to retry the failed action

## Implementation Notes

- Business logic: `lib/hives/server/createHive.ts` (dependency-injected Supabase client)
- Validation schemas: `lib/hives/schemas.ts` and `lib/hives/data/hiveSchemas.ts`
- Invite logic: `app/api/hives/[hiveId]/invite/route.ts` (reused, not duplicated)
- Logo storage: Supabase Storage bucket `logos`, path format `<hiveId>/<uuid>.<ext>`
- Signed URLs: `lib/hives/server/getHivesWithSignedUrls.ts`

## Testing Coverage

### Unit/Integration Tests
- **`app/tests/api/hives-create.test.ts`**: Hive creation API
  - Unauthenticated rejection
  - Invalid JSON body
  - Valid JSON creation
  - Invalid logo file type
  - Valid multipart with logo
- **`app/tests/api/hives-invite.test.ts`**: Invite API
  - Unauthenticated rejection
  - Invalid email format
  - More than 10 emails
  - Empty emails array
  - Non-existent hive
  - Non-admin member rejection
  - Non-member rejection
  - Successful invite creation for admin

### Manual Testing Scenarios
1. **Happy path:** Create hive with name + logo + 3 invites → Success, redirect to hive homepage
2. **Skip invites:** Create hive with name only, skip Step 2 → Success, redirect to hive homepage
3. **No logo:** Create hive with name only (no logo) → Success
4. **Invalid email:** Enter invalid email in Step 2 → Continue button disabled, inline error shown
5. **Too many emails:** Enter 11 emails in Step 2 → Continue button disabled
6. **Hive creation fails:** API error in Step 3 → Return to Step 1 with error in Alert
7. **Invite fails after hive created:** Step 3 creates hive successfully, invites fail → Redirect to `/hives/:hiveKey/invite?error=...`
8. **Cancel from Step 1:** Click Cancel → Return to `/hives`
9. **Back from Step 2:** Click Back → Return to Step 1 with preserved inputs
10. **Double-submit protection:** Rapid clicks on Continue in Step 2 → Only one orchestration runs

## Acceptance Criteria

- From `/hives`, **Create a New Hive** opens `/hives/new`
- Step 1: Collect name + optional logo, validate, navigate to Step 2
- Step 2: Collect draft invites (max 10), skip option, back option
- Step 3: Create hive + send invites sequentially, handle errors gracefully
- Unauthorized users redirected to `/login` when visiting `/hives/new`
- Hive creation failure returns to Step 1 with error
- Invite failure (after hive created) redirects to invite page with error
- All inputs preserved when navigating back from Step 2 to Step 1
- No double-submit issues (idempotent orchestration)
- API contracts unchanged (reuse existing routes)

## Future Enhancements

- Send actual invitation emails (currently just DB records)
- Generate invite tokens for public invite links
- Bulk invite from CSV upload
- Member role selection during invite
- Invite preview/confirmation step before Step 3
