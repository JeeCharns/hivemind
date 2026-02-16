# Leave Hive Feature Design

**Date:** 2026-02-16
**Status:** Approved

## Overview

Add a "Leave Hive" button to the navbar dropdown (PageSelector) that allows users to leave a hive they're a member of. Includes a styled confirmation modal and proper validation.

## User Flow

1. User clicks dropdown in navbar (shows home, members, settings, etc.)
2. "Leave Hive" button appears at bottom of dropdown
3. Clicking opens a confirmation modal: "Are you sure you want to leave [Hive Name]?"
4. On confirm: user is removed from hive, redirected to `/hives`
5. On cancel: modal closes, user stays on current page

## Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ConfirmationModal` | `app/components/ConfirmationModal.tsx` | Reusable modal for confirmations |
| `LeaveHiveButton` | `app/components/navbar/LeaveHiveButton.tsx` | Button + modal trigger in dropdown |
| `leaveHiveAction` | `app/hives/[hiveId]/members/actions.ts` | Server action to remove current user |

## Technical Details

### ConfirmationModal

Reusable component with:
- Title and message props
- Confirm/cancel buttons with customisable labels
- Click-outside and Escape key to close
- Danger variant styling for destructive actions

### LeaveHiveButton

- Renders in PageSelector dropdown after other navigation items
- Manages modal open/close state
- Calls `leaveHiveAction()` on confirm
- Handles loading state during action
- Redirects to `/hives` on success

### leaveHiveAction

- Server action in existing `actions.ts` file
- Validates user is authenticated
- Validates user is a member of the hive
- Reuses `canRemoveMember()` validation (blocks last admin)
- Removes membership record
- Revalidates cache

## Validation Rules

- **Last admin cannot leave**: If user is the only admin, show error "You're the only admin. Promote another member before leaving."
- **Must be a member**: Verify user is actually a member of the hive
- **Authenticated**: User must be logged in

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Last admin | Show error in modal, don't close |
| Network error | Show error message with retry option |
| Not a member | Redirect to `/hives` (already left) |
| Success | Redirect to `/hives` |
