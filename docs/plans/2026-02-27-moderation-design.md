# Moderation Feature Design

**Date:** 2026-02-27
**Status:** Approved

## Overview

Allow hive admins to moderate responses by flagging them with predefined categories. Moderated responses are immediately hidden from the live feed and excluded from analysis. A publicly accessible Moderation History page shows all moderation actions, and admins can reinstate responses while preserving the audit trail.

## Requirements

- Admin users see a "moderate" button on hover for each response (same styling as edit/delete)
- Clicking moderate opens a menu with 5 fixed flag types: antisocial, misleading, illegal, spam, doxing
- Selecting a flag immediately hides the response from the live feed
- Moderated responses are excluded from analysis (clustering, themes)
- No notification sent to response authors
- Moderation History accessible from conversation header dropdown (visible to all users)
- History page groups responses by flag category with moderation timestamps
- Admins can reinstate responses via confirmation modal
- Reinstated responses remain in history with "reinstated" tag

## Database Schema

### New enum type

```sql
CREATE TYPE moderation_flag AS ENUM ('antisocial', 'misleading', 'illegal', 'spam', 'doxing');
```

### Alter conversation_responses

```sql
ALTER TABLE conversation_responses
  ADD COLUMN moderation_flag moderation_flag,
  ADD COLUMN moderated_at TIMESTAMPTZ,
  ADD COLUMN moderated_by UUID REFERENCES profiles(id);
```

### New audit log table

```sql
CREATE TABLE response_moderation_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  response_id BIGINT REFERENCES conversation_responses(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'moderated' | 'reinstated'
  flag moderation_flag,
  performed_by UUID REFERENCES profiles(id) NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Key behaviours

- A response is "moderated" when `moderation_flag IS NOT NULL`
- Reinstatement clears `moderation_flag`, `moderated_at`, `moderated_by`
- Each action creates a log entry preserving full audit history

## API Endpoints

### POST `/api/conversations/[conversationId]/responses/[responseId]/moderate`

- **Body:** `{ flag: 'antisocial' | 'misleading' | 'illegal' | 'spam' | 'doxing' }`
- **Auth:** Requires hive admin
- **Action:** Sets moderation fields on response; creates log entry
- **Returns:** `{ success: true }`
- **Errors:** 400 if already moderated, 403 if not admin

### POST `/api/conversations/[conversationId]/responses/[responseId]/reinstate`

- **Body:** none
- **Auth:** Requires hive admin
- **Action:** Clears moderation fields; creates 'reinstated' log entry with original flag
- **Returns:** `{ success: true }`
- **Errors:** 400 if not currently moderated, 403 if not admin

### GET `/api/conversations/[conversationId]/moderation`

- **Auth:** Any authenticated user
- **Returns:** `{ history: ModerationLogEntry[] }` with response text, flag, action, timestamp, admin name

### Updated existing endpoints

- `GET /api/conversations/[conversationId]/responses` - Filter: `WHERE moderation_flag IS NULL`
- Analysis pipeline - Exclude moderated responses from clustering queries

## UI Components

### 1. Moderate Button (ListenView)

- Appears on hover for admins, alongside edit/delete buttons
- Icon: `Flag` from Phosphor icons
- On click: Opens moderation flag popover

### 2. Moderation Flag Menu

- Small popover with 5 icon buttons in a row:
  - 🤬 Antisocial
  - 🤥 Misleading
  - 🚩 Illegal
  - 🗑️ Spam
  - 🔏 Doxing
- Clicking a flag immediately moderates (no confirmation)
- Response disappears with toast: "Response moderated"

### 3. ConversationHeader Dropdown

- New menu item: "Moderation History" (visible to all users)
- Links to `/[hiveKey]/[conversationKey]/moderation`

### 4. Moderation History Page

- Route: `app/(main)/[hiveKey]/[conversationKey]/moderation/page.tsx`
- Layout: ConversationHeader + "Moderation History" title
- Responses grouped by flag category (emoji + label headings)
- Each response shows:
  - Response text
  - "Moderated [date/time]"
  - If reinstated: "Reinstated [date/time]" grey badge
- Admin-only: "Reinstate" button on non-reinstated responses
- Confirmation modal: "Are you sure you want to reinstate this opinion?"

## Data Flow

1. Admin hovers response → Flag button → flag menu
2. Admin selects flag → API `/moderate` → response removed from state → toast
3. User opens ellipsis menu → "Moderation History" → moderation page
4. Page fetches `/moderation` endpoint → displays grouped by flag
5. Admin clicks "Reinstate" → modal → API `/reinstate` → response returns to feed

## Edge Cases

- **Already moderated:** API returns 400
- **Already reinstated:** API returns 400
- **Non-admin moderate/reinstate:** API returns 403
- **Analysis exclusion:** `WHERE moderation_flag IS NULL` in clustering queries
- **Guest responses:** Can be moderated (have response IDs)
- **Real-time updates:** Broadcast moderation event for other viewers

## Out of Scope

- Bulk moderation
- Author notifications
- Appeal workflow
- Moderation statistics/dashboard
- Custom flag types per hive
