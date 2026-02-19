# Notifications Feature Design

## Overview

A notification system that alerts users to activity in their Hives via in-app notifications (bell icon in navbar) and email notifications. Notifications are created automatically via database triggers and delivered in real-time using Supabase Realtime.

## Requirements

### In-App Notifications
- Bell icon in navbar (left of user dropdown) with unread count badge
- Dropdown showing recent notifications on click
- Real-time updates via Supabase Realtime (postgres_changes)
- Click navigates to relevant page with anchor/highlight
- Opening dropdown marks all visible notifications as read
- "Clear all" button + auto-expiry after 90 days

### Email Notifications
- Sent immediately when events occur
- Per-type toggles in user settings (new_conversation, conversation_progress)
- Sent via Nodemailer with Zoho SMTP

### Notification Triggers
| Type | In-App | Email | Source |
|------|--------|-------|--------|
| `new_conversation` | Yes | Yes (if enabled) | New conversation in any Hive user is a member of |
| `analysis_complete` | Yes | Yes (as "progress") | Conversation analysis completes |
| `report_generated` | Yes | Yes (as "progress") | Report is generated |
| `opinion_liked` | Yes | No | Someone likes user's response |

## Database Schema

### `user_notifications` Table

```sql
CREATE TABLE user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'new_conversation', 'analysis_complete', 'report_generated', 'opinion_liked'
  title TEXT NOT NULL,
  body TEXT,

  -- Polymorphic reference to source
  hive_id UUID REFERENCES hives(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  response_id UUID REFERENCES responses(id) ON DELETE SET NULL,

  -- For deep linking with anchor
  link_path TEXT NOT NULL,  -- e.g., '/hives/abc/conversations/xyz#response-123'

  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_user_notifications_user_unread
  ON user_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_user_notifications_cleanup
  ON user_notifications(created_at)
  WHERE created_at < now() - INTERVAL '90 days';
```

### Additions to `profiles` Table

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  email_preferences JSONB DEFAULT '{"new_conversation": true, "conversation_progress": true}'::jsonb;
```

### RLS Policies

- Users can only SELECT/UPDATE/DELETE their own notifications
- Notifications are created by SECURITY DEFINER trigger functions

## Database Triggers

### 1. New Conversation

```sql
CREATE OR REPLACE FUNCTION notify_new_conversation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_notifications (user_id, type, title, body, hive_id, conversation_id, link_path)
  SELECT
    m.user_id,
    'new_conversation',
    'New conversation in ' || h.name,
    NEW.title,
    NEW.hive_id,
    NEW.id,
    '/hives/' || h.slug || '/conversations/' || NEW.id
  FROM hive_members m
  JOIN hives h ON h.id = NEW.hive_id
  WHERE m.hive_id = NEW.hive_id
    AND m.user_id != NEW.created_by;

  -- Send emails via pg_net (see Email section)

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_new_conversation
  AFTER INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION notify_new_conversation();
```

### 2. Analysis Complete

Triggers when `conversation_analysis.status` changes to `'complete'`. Notifies all Hive members.

### 3. Report Generated

Triggers on INSERT to reports table. Notifies all Hive members.

### 4. Opinion Liked

Triggers on INSERT to `response_likes`. Notifies the response author (not the liker, not if self-like).

## Email System

### Architecture

```
Trigger fires → pg_net.http_post() → /api/notifications/email → Nodemailer → Zoho SMTP
```

### Email Service

Location: `lib/notifications/server/emailService.ts`

```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,        // smtp.zoho.com
  port: Number(process.env.SMTP_PORT), // 465
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendNotificationEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html: htmlBody,
  });
}
```

### Email Templates

- **New conversation**: "A new conversation '{title}' has started in {hive_name}"
- **Conversation progress**: "The conversation '{title}' has new insights available"

### Environment Variables

```
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=xxx
SMTP_FROM="Hivemind <noreply@yourdomain.com>"
INTERNAL_API_KEY=xxx  # For trigger → API authentication
```

## Frontend

### Components

#### `NotificationBell` (`app/components/navbar/NotificationBell.tsx`)

- Bell icon (Lucide Bell/BellDot)
- Badge with unread count (hidden if 0)
- Click toggles dropdown

#### `NotificationDropdown` (`app/components/navbar/NotificationDropdown.tsx`)

- Positioned below bell
- Shows last 20 notifications (most recent first)
- Each item: icon (by type), title, body preview, relative time
- Click navigates to `link_path`
- "Clear all" button
- Empty state: "No notifications"

### Hook: `useNotifications`

Location: `lib/notifications/hooks/useNotifications.ts`

Following the `useHiveReactions` pattern:
- Fetches initial notifications from `/api/notifications`
- Subscribes to `postgres_changes` on `user_notifications` filtered by `user_id`
- On INSERT, prepends to list and increments unread count
- Provides `markAllRead()` and `clearAll()` functions
- Returns `{ notifications, unreadCount, status, markAllRead, clearAll }`

### Navbar Integration

Add `NotificationBell` next to `UserMenu` in `/app/components/Navbar.tsx`:

```
[HiveSelector] [PageSelector] -----spacer----- [NotificationBell] [UserMenu]
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/notifications` | GET | Fetch user's notifications (paginated) |
| `/api/notifications/read` | PATCH | Mark all as read |
| `/api/notifications` | DELETE | Clear all notifications |
| `/api/notifications/email` | POST | Internal: send email (called by trigger) |
| `/api/profile/notifications` | PATCH | Update email preferences |

## Notification Preferences UI

Add section to user settings page:

```
Email Notifications
───────────────────
☑ New conversations
  Receive an email when a new conversation starts in your Hives

☑ Conversation progress
  Receive an email when a conversation you contributed to has new analysis or reports
```

## File Structure

```
lib/notifications/
├── server/
│   ├── emailService.ts
│   ├── notificationService.ts
│   └── schemas.ts
├── hooks/
│   ├── useNotifications.ts
│   └── useNotificationPreferences.ts
└── domain/
    └── notification.types.ts

app/api/notifications/
├── route.ts
├── read/route.ts
└── email/route.ts

app/api/profile/
└── notifications/route.ts

app/components/navbar/
├── NotificationBell.tsx
└── NotificationDropdown.tsx

supabase/migrations/
└── 0XX_create_notifications.sql
```

## Future Enhancements

- **Email digest batching**: Collect notifications over 4-hour windows (8am, 12pm, 4pm, 8pm user local time) instead of immediate sending
- **Per-Hive notification settings**: Allow users to mute specific Hives
- **Push notifications**: Web push for desktop/mobile browsers
- **Full notifications page**: `/notifications` with filtering, search, and full history
