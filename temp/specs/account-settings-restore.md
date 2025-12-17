# Spec: Restore Account Settings (Navbar User Menu)

## Context

The production app currently has a user dropdown (`app/components/navbar/UserMenu.tsx`) with only “Logout”. A full “Account settings” experience exists in the prototype under `temp/` (e.g. `temp/atoms/user-selector.tsx`, `temp/app/(dashboard)/account/page.tsx`), but its “backend” is largely client-side Supabase calls (direct DB/storage mutations from the browser).

This spec restores an Account Settings page reachable from the navbar dropdown, reusing the existing frontend patterns/components, but rewriting the backend logic and functions from the ground up to match repo standards (CLAUDE.md / AGENTS.md):

- Thin routes, business logic in `lib/**/server/*`
- Zod boundary validation
- Stable API errors: `{ error: string, code?: string }` via `lib/api/errors.ts`
- Dependency injection of `SupabaseClient` into server services

## Goals

- Add “Account settings” entry in the production navbar user menu.
- Add an authenticated Account Settings page that reuses the profile setup UI components.
- Replace client-side Supabase mutations with server-side API routes + `lib/**/server/*` services.
- Keep response/error shapes stable and testable with Jest.

## Non-goals (for this iteration)

- Billing/plan management.
- Organization/hive-level settings (already handled under `/hives/:hiveId/settings`).
- Adding new auth factors, SSO, or complex re-auth flows (can be layered later).

## Target UX

### Entry point

- From any page showing the fixed navbar, open the user dropdown and click “Account settings”.
- Route to a top-level account settings page (not hive-scoped).

### Page content (initial scope)

**Profile section (reusing profile setup components)**

- Display name (required; 1–60 chars).
- Avatar (optional; max 2MB; jpeg/png/webp/gif).
- “Save changes” button with loading state.
- In-page error banner; success message/toast.

**Account section (read-only for now)**

- Email address (from auth session).
- “Logout” remains in the menu (existing behavior).

## Routing & Layout

### Canonical route

- Canonical: `GET /settings` (account settings).
- Optional compatibility alias: `GET /account` → redirect to `/settings` (mirrors the `temp/` prototype route).

Rationale:

- `lib/auth/server/middleware.ts` already treats `/settings` as a protected prefix.
- Keeps hive settings under `/hives/:hiveId/settings` clearly separate from account settings at `/settings`.

### Layout

Add `app/settings/layout.tsx` as a server layout that renders the fixed navbar without hive context:

- Calls `getNavbarViewModel({})` (no `hiveKey`) and passes it into `app/components/Navbar.tsx`.
- Wraps children with `pt-16` to account for fixed navbar.

## Frontend Reuse Plan

### Components to reuse (production)

Reuse the exact components already used by profile onboarding:

- `app/profile-setup/ProfileSetupForm.tsx` (or extract a shared form component from it)
- `app/components/ImageUpload.tsx`
- `app/components/button` (existing shared Button)

Recommended refactor to avoid duplication:

1. Extract a shared presentational form component:
   - `app/components/profile/ProfileForm.tsx` (client component)
   - Props: `initialDisplayName`, `initialAvatarUrl`, `submitLabel`, `onSuccess` (callback), optional `successMessage`.
2. Update:
   - `app/profile-setup/ProfileSetupForm.tsx` to wrap `ProfileForm` and redirect to `/hives` on success.
   - New `app/settings/AccountSettingsForm.tsx` to wrap `ProfileForm` and stay on the page (show success toast/banner).

Notes:

- `app/components/ImageUpload.tsx` currently uses `alert()` for oversize file selection. For settings (and ideally onboarding too), replace this UX with an in-form error surface (prop-driven) rather than `alert()`.

### Account settings page server component

`app/settings/page.tsx` should:

- Require session (`getServerSession()`).
- Fetch current profile values (display_name, avatar_path) from `profiles`.
- Derive `avatarUrl` via storage public URL helper (using the same bucket constant used by the backend).
- Render `AccountSettingsForm` with `initialDisplayName`, `initialAvatarUrl`, and read-only email display.

## Backend Rewrite (New Domain)

### API surface

Add an “account” API with stable types and Zod validation.

**`GET /api/account`**

- Auth required.
- Returns a view model for the settings page (email + profile fields).

Response (new type):

- `types/account-api.ts`
  - `AccountSettingsResponse`: `{ email: string; displayName: string | null; avatarUrl: string | null }`

**`POST /api/account/profile`**

- Auth required.
- Accepts `multipart/form-data`:
  - `displayName` (required string)
  - `avatar` (optional file)
  - Optional (for future): `removeAvatar=true` to clear avatar
- Returns:
  - `{ displayName: string; avatarUrl: string | null }`

Error shape:

- Always `{ error: string, code?: string }` via `jsonError`.
- Use `VALIDATION_ERROR`, `UPLOAD_FAILED`, `DB_ERROR`, `INTERNAL_ERROR`.

### Validation

Create `lib/account/schemas.ts`:

- `updateAccountProfileFormSchema`: displayName 1–60 chars (match onboarding).
- `avatarFileSchema`: max 2MB, allowed MIME types (match onboarding).
- `accountSettingsResponseSchema` (optional edge validation).

### Server services (injected dependencies)

Create `lib/account/server/*`:

- `getAccountSettings(supabase, userId)`:
  - Fetches `profiles.display_name`, `profiles.avatar_path`, and uses session for `email`.
  - Returns `AccountSettingsResponse` (or a service-specific view model).

- `updateAccountProfile(supabase, userId, input)`:
  - Handles “update display name + optional avatar upload”.
  - Persists `profiles.display_name` and (if uploaded) `profiles.avatar_path`.
  - Returns `UpdateAccountProfileResponse`.

- `avatarStorage.ts` (or `uploadAccountAvatar.ts` + `deleteAccountAvatars.ts`):
  - Upload to `avatars` bucket under `${userId}/${uuid}.${ext}`.
  - Remove prior files under `userId/` (or keep N=1 newest) to prevent storage bloat.

### Bucket consistency (important)

There is currently a mismatch between:

- Migration: creates bucket `avatars` (`supabase/migrations/005_add_profile_avatar.sql`)
- Profile setup page: reads from `.storage.from("avatars")` (`app/profile-setup/page.tsx`)
- Profile upload services: default to `"user-avatars"` (`lib/profile/server/uploadAvatar.ts`, `lib/profile/server/upsertProfile.ts`)

As part of the account backend rewrite, standardize the default avatar bucket to `avatars` across services and pages.

Implementation approach:

- Introduce a single source of truth constant (e.g. `lib/profile/avatarBucket.ts` or `lib/storage/avatarBucket.ts`) that resolves env vars and defaults to `"avatars"`.
- Update both account services and existing profile services to use it.
- Keep support for `SUPABASE_AVATAR_BUCKET` / `NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET` overrides.

## Authorization & Security

- Only operate on the authenticated user’s profile row (`profiles.id === session.user.id`).
- Do not accept a `userId` from the client.
- Rely on storage RLS policies (foldername == auth.uid()) plus server-side session enforcement.
- Do not log cookies/tokens; logs should use route/service prefixes:
  - `[GET /api/account]`, `[POST /api/account/profile]`
  - `[getAccountSettings]`, `[updateAccountProfile]`

## Testing Plan

### API route tests (Jest integration)

Add `app/tests/api/account.test.ts` mirroring `app/tests/api/profile.test.ts`:

- `GET /api/account`
  - `200` with authenticated session
  - `401` unauthenticated
  - `500` service failure returns `{ error, code: "INTERNAL_ERROR" }`

- `POST /api/account/profile`
  - `200` valid displayName
  - `400` missing/empty/too-long displayName (`VALIDATION_ERROR`)
  - `400` invalid avatar type/size (`UPLOAD_FAILED` or `VALIDATION_ERROR`—pick one and keep consistent)
  - `401` unauthenticated
  - `500` upload failure (`UPLOAD_FAILED`)
  - `500` DB failure (`DB_ERROR`)

Mock patterns:

- Mock `supabaseServerClient`, `getServerSession`, and the new `lib/account/server/*` services.

### Service unit tests

Add `lib/account/server/__tests__/updateAccountProfile.test.ts`:

- Upload path generation and old file cleanup behavior (mock storage client methods).
- Upsert/update call shape (mock Supabase `.from().update()/upsert()` chain).
- Errors are wrapped with stable messages (no leaking internal details).

## Docs Impact (when implementing)

When implementing this spec (not required for the spec-only change):

- Update `docs/feature-map.md` with pointers for:
  - Account settings page (`app/settings/page.tsx`, `app/settings/AccountSettingsForm.tsx`)
  - Account API routes (`app/api/account/*`)
  - Account services (`lib/account/server/*`)
- If avatar bucket standardization changes environment expectations, update:
  - `docs/setup/README.md` and/or `supabase/README.md` (bucket name, env vars)

## Rollout & Migration

- Ship page + menu item behind a feature flag if needed (optional).
- If standardizing bucket name from `"user-avatars"` → `"avatars"`, add a one-time server-side fallback:
  - When generating `avatarUrl`, if the path exists but URL generation fails in the primary bucket, try the legacy bucket for reads.
  - Do not dual-write; migrate once and remove fallback after confidence.

## Implementation Checklist (Files)

**UI**

- Update `app/components/navbar/UserMenu.tsx` to add “Account settings” link.
- Add `app/settings/layout.tsx` and `app/settings/page.tsx`.
- Add `app/settings/AccountSettingsForm.tsx` (or shared `app/components/profile/ProfileForm.tsx`).

**Backend**

- Add `app/api/account/route.ts` (GET).
- Add `app/api/account/profile/route.ts` (POST multipart).
- Add `types/account-api.ts`.
- Add `lib/account/schemas.ts`.
- Add `lib/account/server/*` services.
- Standardize avatar bucket constant and update usages.

**Tests**

- Add `app/tests/api/account.test.ts`.
- Add `lib/account/server/__tests__/*`.

## Open Questions

1. Should the canonical route be `/settings` or `/account`? (Spec proposes `/settings` + redirect.)
2. Should avatar removal be supported in v1 (button + `removeAvatar`)?
3. Should display name updates be immediately reflected in navbar (requires refresh/revalidate strategy)?

