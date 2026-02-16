# Edit/Delete Response UI Design

**Date:** 2026-02-16
**Status:** Approved

## Overview

Add inline edit and delete functionality for users' own responses in the Listen tab live feed.

## User Flow

1. User sees their responses in the feed with pencil and trash icons next to the like button
2. **Edit:** Click pencil → text becomes editable textarea → Save/Cancel buttons appear
3. **Delete:** Click trash → ConfirmationModal appears → confirm removes response

## Technical Changes

### Types
- Add `isMine: boolean` to `LiveResponse` in `lib/conversations/domain/listen.types.ts`

### API
- Update feed fetching to include `isMine` based on session user ID
- Existing endpoints already handle PATCH/DELETE at `/api/conversations/[conversationId]/responses/[responseId]`

### UI (ListenView.tsx)
- Add Pencil and Trash icons (from @phosphor-icons/react) for responses where `isMine === true`
- Inline edit mode: swap text `<p>` for `<textarea>` with Save/Cancel
- Delete uses existing `ConfirmationModal` component

### State Management
- Track `editingId: string | null` for which response is being edited
- Track `editText: string` for the edited text
- Optimistic updates with rollback on error

## Error Handling
- Show inline error message if edit/delete fails
- Rollback optimistic update on failure
