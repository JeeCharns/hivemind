# Avatar Image Navbar Fix Design

**Date:** 2026-02-22
**Status:** Completed

## Problem Statement

Hive logo/avatar images were not appearing in the navigation menus. Both the desktop `HiveSelector` dropdown and the `MobileDrawer` displayed only text initials (computed inline) instead of the actual uploaded hive logos. This happened because:

1. **Missing data:** The `NavbarViewModel` did not include `logoUrl` in the `HiveOption` type, so hive logo paths were never passed to the navigation components.
2. **No signed URL resolution:** Even if the path had been available, Supabase Storage requires signed URLs to access private bucket objects. The navbar components had no mechanism to resolve these URLs.
3. **Inconsistent fallback rendering:** Each component computed its own initials inline with slightly different logic, rather than reusing the existing `HiveLogo` component which already handles both image display and initial-based fallback.

## Solution Overview

1. **Extend the data model:** Add `logoUrl` to the `HiveOption` type and populate it from the `hive.logo_url` database column in `getNavbarViewModel`.
2. **Resolve signed URLs client-side:** Add a `useHiveLogoUrls` hook that resolves signed storage URLs for all hive logos on mount.
3. **Reuse `HiveLogo` component:** Replace inline initial-rendering `<div>` elements with the existing `HiveLogo` component, which renders the uploaded image when available and falls back to styled initials when not.

## Files Modified

### 1. `types/navbar.ts`

- Added `logoUrl: string | null` to the `HiveOption` interface.

### 2. `lib/navbar/getNavbarViewModel.ts`

- Included `logoUrl: hive.logo_url` when mapping hive records to `HiveOption` objects, ensuring the logo path is available downstream.

### 3. `app/components/navbar/HiveSelector.tsx`

- Added a `useHiveLogoUrls` hook that resolves signed URLs for all hive logos via `getLogoSignedUrl` from `lib/supabase/storage`.
- Replaced inline initials rendering (both for the selected hive button and the dropdown list items) with the reusable `HiveLogo` component.
- Removed duplicated initials-computation logic.

### 4. `app/components/navbar/MobileDrawer.tsx`

- Added the same signed URL resolution logic (`useEffect` with `getLogoSignedUrl`).
- Replaced inline `<span>` initials in both the "Other Hives" and "Switch Hive" sections with the `HiveLogo` component.

## Technical Details

### Signed URL Resolution

Hive logos are stored in a private Supabase Storage bucket. Rendering them in the browser requires a time-limited signed URL. The resolution is performed client-side on component mount:

```ts
useEffect(() => {
  let cancelled = false;
  const resolve = async () => {
    const entries = await Promise.all(
      hives.map(async (h) => {
        const url = await getLogoSignedUrl(h.logoUrl);
        return [h.id, url] as const;
      })
    );
    if (!cancelled) {
      setLogoUrls(Object.fromEntries(entries));
    }
  };
  resolve();
  return () => {
    cancelled = true;
  };
}, [hives]);
```

- Uses `Promise.all` to resolve all hive logos in parallel.
- Includes a cancellation flag to prevent state updates on unmounted components.
- Returns a `Record<string, string | null>` mapping hive IDs to their signed URLs.

### HiveLogo Component Reuse

The existing `HiveLogo` component (`app/components/hive-logo.tsx`) handles both states:

- **With image:** Renders a Next.js `<Image>` with `object-cover` styling inside a rounded container.
- **Without image (fallback):** Renders styled initials derived from the hive name in an indigo-themed circle.

This eliminates the duplicated initials logic that previously existed in both `HiveSelector` and `MobileDrawer`.

## Edge Cases

| Case                              | Handling                                                         |
| --------------------------------- | ---------------------------------------------------------------- |
| Hive has no uploaded logo         | `logoUrl` is `null`; `HiveLogo` renders initials fallback        |
| Signed URL resolution fails       | `getLogoSignedUrl` returns `null`; fallback initials are shown   |
| Component unmounts during resolve | Cancellation flag prevents stale state updates                   |
| Hive list changes (navigation)    | `useEffect` dependency on `hives` triggers re-resolution         |
| Empty hive name                   | `HiveLogo` defaults label to "Hive" and renders "HI" as initials |

## Trade-offs

**Accepted limitation:** Logo URLs are resolved client-side on each mount, which adds a brief delay before images appear. This is acceptable because:

- The initials fallback renders immediately, so there is no layout shift or blank space.
- Server-side resolution would require making `HiveSelector` and `MobileDrawer` async server components, which conflicts with their interactive (stateful) nature.
- The parallel `Promise.all` resolution keeps the delay minimal even with many hives.

## Testing Strategy

- Manual verification that hive logos appear in the desktop `HiveSelector` dropdown.
- Manual verification that hive logos appear in the `MobileDrawer` on mobile viewports.
- Verification of fallback initials when no logo is uploaded.
- Verification that switching between hives updates the displayed logo.
