# Notifications Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement in-app notifications (bell icon with dropdown) and email notifications for new conversations, analysis completion, report generation, and opinion likes.

**Architecture:** Database triggers create notification records automatically. Supabase Realtime pushes new notifications to the UI. pg_net calls a Next.js API endpoint to send emails via Nodemailer/Zoho SMTP.

**Tech Stack:** Supabase (Postgres triggers, RLS, Realtime, pg_net), Next.js API routes, Nodemailer, Zod, React hooks, Lucide icons

---

## Task 1: Create Notification Types and Schemas

**Files:**
- Create: `lib/notifications/domain/notification.types.ts`
- Create: `lib/notifications/server/schemas.ts`

**Step 1: Create the types file**

```typescript
// lib/notifications/domain/notification.types.ts

/**
 * Notification Domain Types
 *
 * Core types for the notification system.
 */

export type NotificationType =
  | 'new_conversation'
  | 'analysis_complete'
  | 'report_generated'
  | 'opinion_liked';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  hiveId: string | null;
  conversationId: string | null;
  responseId: string | null;
  linkPath: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  hive_id: string | null;
  conversation_id: string | null;
  response_id: string | null;
  link_path: string;
  read_at: string | null;
  created_at: string;
}

export interface EmailPreferences {
  new_conversation: boolean;
  conversation_progress: boolean;
}

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  new_conversation: true,
  conversation_progress: true,
};
```

**Step 2: Create the schemas file**

```typescript
// lib/notifications/server/schemas.ts

/**
 * Notification Zod Schemas
 *
 * Runtime validation for notification-related API requests.
 */

import { z } from 'zod';

export const emailPreferencesSchema = z.object({
  new_conversation: z.boolean().optional(),
  conversation_progress: z.boolean().optional(),
});

export const updateEmailPreferencesSchema = z.object({
  email_preferences: emailPreferencesSchema,
});

export const sendEmailRequestSchema = z.object({
  notification_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

export type UpdateEmailPreferencesInput = z.infer<typeof updateEmailPreferencesSchema>;
export type SendEmailRequestInput = z.infer<typeof sendEmailRequestSchema>;
```

**Step 3: Verify files exist**

Run: `ls -la lib/notifications/domain/ lib/notifications/server/`
Expected: Both files created

**Step 4: Commit**

```bash
git add lib/notifications/domain/notification.types.ts lib/notifications/server/schemas.ts
git commit -m "feat(notifications): add domain types and Zod schemas"
```

---

## Task 2: Create Database Migration

**Files:**
- Create: `supabase/migrations/038_create_notifications.sql`

**Step 1: Write the migration file**

```sql
-- Migration: Create notification system tables and triggers
-- Tables: user_notifications
-- Triggers: new_conversation, analysis_complete, report_generated, opinion_liked

-- ============================================
-- 1. USER NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_conversation', 'analysis_complete', 'report_generated', 'opinion_liked')),
  title TEXT NOT NULL,
  body TEXT,

  -- Polymorphic reference to source
  hive_id UUID REFERENCES hives(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  response_id BIGINT REFERENCES conversation_responses(id) ON DELETE SET NULL,

  -- For deep linking with anchor
  link_path TEXT NOT NULL,

  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching user's unread notifications
CREATE INDEX idx_user_notifications_user_unread
  ON user_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Index for 90-day cleanup job
CREATE INDEX idx_user_notifications_cleanup
  ON user_notifications(created_at)
  WHERE created_at < now() - INTERVAL '90 days';

-- Enable RLS
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON user_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON user_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON user_notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Service role has full access (for triggers)
CREATE POLICY "Service role has full access to user_notifications"
  ON user_notifications
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;


-- ============================================
-- 2. ADD EMAIL_PREFERENCES TO PROFILES
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  email_preferences JSONB DEFAULT '{"new_conversation": true, "conversation_progress": true}'::jsonb;


-- ============================================
-- 3. NOTIFICATION TRIGGERS
-- ============================================

-- 3a. New Conversation Trigger
CREATE OR REPLACE FUNCTION notify_new_conversation()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notification for all hive members except the creator
  INSERT INTO user_notifications (user_id, type, title, body, hive_id, conversation_id, link_path)
  SELECT
    m.user_id,
    'new_conversation',
    'New conversation in ' || h.name,
    NEW.title,
    NEW.hive_id,
    NEW.id,
    '/hives/' || COALESCE(h.slug, h.id::text) || '/conversations/' || NEW.id
  FROM hive_members m
  JOIN hives h ON h.id = NEW.hive_id
  WHERE m.hive_id = NEW.hive_id
    AND m.user_id != NEW.created_by;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_new_conversation
  AFTER INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION notify_new_conversation();


-- 3b. Analysis Complete Trigger
CREATE OR REPLACE FUNCTION notify_analysis_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when analysis_status changes to 'ready'
  IF NEW.analysis_status = 'ready' AND (OLD.analysis_status IS NULL OR OLD.analysis_status != 'ready') THEN
    INSERT INTO user_notifications (user_id, type, title, body, hive_id, conversation_id, link_path)
    SELECT
      m.user_id,
      'analysis_complete',
      'Analysis complete',
      NEW.title,
      NEW.hive_id,
      NEW.id,
      '/hives/' || COALESCE(h.slug, h.id::text) || '/conversations/' || NEW.id || '#analysis'
    FROM hives h
    JOIN hive_members m ON m.hive_id = h.id
    WHERE h.id = NEW.hive_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_analysis_complete
  AFTER UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION notify_analysis_complete();


-- 3c. Report Generated Trigger
CREATE OR REPLACE FUNCTION notify_report_generated()
RETURNS TRIGGER AS $$
DECLARE
  v_conversation RECORD;
BEGIN
  -- Get conversation details
  SELECT c.id, c.title, c.hive_id, h.slug, h.name as hive_name
  INTO v_conversation
  FROM conversations c
  JOIN hives h ON h.id = c.hive_id
  WHERE c.id = NEW.conversation_id;

  IF v_conversation IS NOT NULL THEN
    INSERT INTO user_notifications (user_id, type, title, body, hive_id, conversation_id, link_path)
    SELECT
      m.user_id,
      'report_generated',
      'New report available',
      v_conversation.title,
      v_conversation.hive_id,
      v_conversation.id,
      '/hives/' || COALESCE(v_conversation.slug, v_conversation.hive_id::text) || '/conversations/' || v_conversation.id || '#report'
    FROM hive_members m
    WHERE m.hive_id = v_conversation.hive_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_report_generated
  AFTER INSERT ON conversation_reports
  FOR EACH ROW EXECUTE FUNCTION notify_report_generated();


-- 3d. Opinion Liked Trigger
CREATE OR REPLACE FUNCTION notify_opinion_liked()
RETURNS TRIGGER AS $$
DECLARE
  v_response RECORD;
BEGIN
  -- Get response and conversation details
  SELECT
    r.id as response_id,
    r.user_id as author_id,
    LEFT(r.response_text, 100) as response_preview,
    c.id as conversation_id,
    c.title as conversation_title,
    c.hive_id,
    h.slug
  INTO v_response
  FROM conversation_responses r
  JOIN conversations c ON c.id = r.conversation_id
  JOIN hives h ON h.id = c.hive_id
  WHERE r.id = NEW.response_id;

  -- Only notify if the liker is not the author
  IF v_response IS NOT NULL AND v_response.author_id != NEW.user_id THEN
    INSERT INTO user_notifications (user_id, type, title, body, hive_id, conversation_id, response_id, link_path)
    VALUES (
      v_response.author_id,
      'opinion_liked',
      'Someone liked your opinion',
      v_response.response_preview,
      v_response.hive_id,
      v_response.conversation_id,
      v_response.response_id,
      '/hives/' || COALESCE(v_response.slug, v_response.hive_id::text) || '/conversations/' || v_response.conversation_id || '#response-' || v_response.response_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_opinion_liked
  AFTER INSERT ON response_likes
  FOR EACH ROW EXECUTE FUNCTION notify_opinion_liked();
```

**Step 2: Run the migration locally**

Run: `npx supabase db push` or apply via Supabase dashboard
Expected: Migration applies successfully

**Step 3: Commit**

```bash
git add supabase/migrations/038_create_notifications.sql
git commit -m "feat(db): add notifications table and triggers"
```

---

## Task 3: Create Email Service

**Files:**
- Create: `lib/notifications/server/emailService.ts`
- Modify: `package.json` (add nodemailer)

**Step 1: Install nodemailer**

Run: `npm install nodemailer && npm install -D @types/nodemailer`
Expected: Package added to package.json

**Step 2: Create the email service**

```typescript
// lib/notifications/server/emailService.ts

/**
 * Email Service
 *
 * Sends notification emails via Nodemailer with Zoho SMTP.
 */

import nodemailer from 'nodemailer';
import type { NotificationType } from '../domain/notification.types';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.zoho.com',
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface EmailContent {
  subject: string;
  html: string;
}

function getEmailContent(
  type: NotificationType,
  title: string,
  body: string | null,
  linkPath: string
): EmailContent | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.hivemind.com';
  const fullLink = `${baseUrl}${linkPath}`;

  switch (type) {
    case 'new_conversation':
      return {
        subject: `New conversation: ${body ?? 'Untitled'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e293b;">${title}</h2>
            <p style="color: #475569;">A new conversation has been started:</p>
            <p style="color: #1e293b; font-size: 18px; font-weight: 500;">${body ?? 'Untitled'}</p>
            <a href="${fullLink}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">View Conversation</a>
          </div>
        `,
      };

    case 'analysis_complete':
    case 'report_generated':
      return {
        subject: `${type === 'analysis_complete' ? 'Analysis complete' : 'New report available'}: ${body ?? 'Untitled'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e293b;">${title}</h2>
            <p style="color: #475569;">The conversation "${body ?? 'Untitled'}" has new insights available.</p>
            <a href="${fullLink}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">View Insights</a>
          </div>
        `,
      };

    case 'opinion_liked':
      // No email for opinion likes
      return null;

    default:
      return null;
  }
}

export async function sendNotificationEmail(
  to: string,
  type: NotificationType,
  title: string,
  body: string | null,
  linkPath: string
): Promise<{ success: boolean; error?: string }> {
  // Skip if SMTP not configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('[emailService] SMTP not configured, skipping email');
    return { success: false, error: 'SMTP not configured' };
  }

  const content = getEmailContent(type, title, body, linkPath);
  if (!content) {
    return { success: true }; // Not an error, just not an email-worthy notification
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject: content.subject,
      html: content.html,
    });

    console.log(`[emailService] Email sent to ${to} for ${type}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[emailService] Failed to send email: ${message}`);
    return { success: false, error: message };
  }
}
```

**Step 3: Commit**

```bash
git add package.json package-lock.json lib/notifications/server/emailService.ts
git commit -m "feat(notifications): add email service with Nodemailer"
```

---

## Task 4: Create Notification Service

**Files:**
- Create: `lib/notifications/server/notificationService.ts`

**Step 1: Create the service**

```typescript
// lib/notifications/server/notificationService.ts

/**
 * Notification Service
 *
 * Server-side functions for fetching, updating, and deleting notifications.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Notification, NotificationRow, EmailPreferences } from '../domain/notification.types';

function mapRowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as Notification['type'],
    title: row.title,
    body: row.body,
    hiveId: row.hive_id,
    conversationId: row.conversation_id,
    responseId: row.response_id ? String(row.response_id) : null,
    linkPath: row.link_path,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function getNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 20
): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[notificationService] getNotifications error:', error);
    throw new Error('Failed to fetch notifications');
  }

  return (data ?? []).map(mapRowToNotification);
}

export async function getUnreadCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    console.error('[notificationService] getUnreadCount error:', error);
    return 0;
  }

  return count ?? 0;
}

export async function markAllAsRead(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    console.error('[notificationService] markAllAsRead error:', error);
    throw new Error('Failed to mark notifications as read');
  }
}

export async function clearAllNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_notifications')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[notificationService] clearAllNotifications error:', error);
    throw new Error('Failed to clear notifications');
  }
}

export async function getNotificationById(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string
): Promise<Notification | null> {
  const { data, error } = await supabase
    .from('user_notifications')
    .select('*')
    .eq('id', notificationId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapRowToNotification(data);
}

export async function getEmailPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<EmailPreferences> {
  const { data, error } = await supabase
    .from('profiles')
    .select('email_preferences')
    .eq('id', userId)
    .single();

  if (error || !data?.email_preferences) {
    return { new_conversation: true, conversation_progress: true };
  }

  return data.email_preferences as EmailPreferences;
}

export async function updateEmailPreferences(
  supabase: SupabaseClient,
  userId: string,
  preferences: Partial<EmailPreferences>
): Promise<EmailPreferences> {
  // Get current preferences
  const current = await getEmailPreferences(supabase, userId);
  const updated = { ...current, ...preferences };

  const { error } = await supabase
    .from('profiles')
    .update({ email_preferences: updated })
    .eq('id', userId);

  if (error) {
    console.error('[notificationService] updateEmailPreferences error:', error);
    throw new Error('Failed to update email preferences');
  }

  return updated;
}

export async function getUserEmail(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data?.user?.email) {
    console.error('[notificationService] getUserEmail error:', error);
    return null;
  }

  return data.user.email;
}
```

**Step 2: Commit**

```bash
git add lib/notifications/server/notificationService.ts
git commit -m "feat(notifications): add notification service"
```

---

## Task 5: Create API Endpoints

**Files:**
- Create: `app/api/notifications/route.ts`
- Create: `app/api/notifications/read/route.ts`
- Create: `app/api/notifications/email/route.ts`
- Create: `app/api/profile/notifications/route.ts`

**Step 1: Create GET/DELETE /api/notifications**

```typescript
// app/api/notifications/route.ts

/**
 * Notifications API
 *
 * GET - Fetch user's notifications
 * DELETE - Clear all notifications
 */

import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server/requireAuth';
import { supabaseServerClient } from '@/lib/supabase/serverClient';
import { jsonError } from '@/lib/api/errors';
import {
  getNotifications,
  getUnreadCount,
  clearAllNotifications,
} from '@/lib/notifications/server/notificationService';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError('Unauthorised', 401);
    }

    const supabase = await supabaseServerClient();
    const [notifications, unreadCount] = await Promise.all([
      getNotifications(supabase, session.user.id),
      getUnreadCount(supabase, session.user.id),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error('[GET /api/notifications] Error:', error);
    return jsonError('Internal server error', 500);
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError('Unauthorised', 401);
    }

    const supabase = await supabaseServerClient();
    await clearAllNotifications(supabase, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/notifications] Error:', error);
    return jsonError('Internal server error', 500);
  }
}
```

**Step 2: Create PATCH /api/notifications/read**

```typescript
// app/api/notifications/read/route.ts

/**
 * Mark Notifications Read API
 *
 * PATCH - Mark all notifications as read
 */

import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server/requireAuth';
import { supabaseServerClient } from '@/lib/supabase/serverClient';
import { jsonError } from '@/lib/api/errors';
import { markAllAsRead } from '@/lib/notifications/server/notificationService';

export async function PATCH() {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError('Unauthorised', 401);
    }

    const supabase = await supabaseServerClient();
    await markAllAsRead(supabase, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/notifications/read] Error:', error);
    return jsonError('Internal server error', 500);
  }
}
```

**Step 3: Create POST /api/notifications/email (internal)**

```typescript
// app/api/notifications/email/route.ts

/**
 * Internal Email Notification API
 *
 * POST - Send email for a notification (called by database trigger via pg_net)
 *
 * Security: Requires INTERNAL_API_KEY header
 */

import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/api/errors';
import { sendEmailRequestSchema } from '@/lib/notifications/server/schemas';
import { supabaseAdmin } from '@/lib/supabase/adminClient';
import {
  getNotificationById,
  getEmailPreferences,
  getUserEmail,
} from '@/lib/notifications/server/notificationService';
import { sendNotificationEmail } from '@/lib/notifications/server/emailService';
import type { NotificationType } from '@/lib/notifications/domain/notification.types';

export async function POST(request: NextRequest) {
  try {
    // 1. Verify internal API key
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
      return jsonError('Unauthorised', 401);
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const parsed = sendEmailRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Invalid request body', 400);
    }

    const { notification_id, user_id } = parsed.data;

    // 3. Get notification details
    const supabase = supabaseAdmin();
    const notification = await getNotificationById(supabase, notification_id, user_id);
    if (!notification) {
      return jsonError('Notification not found', 404);
    }

    // 4. Check email preferences
    const preferences = await getEmailPreferences(supabase, user_id);
    const notificationType = notification.type as NotificationType;

    // Map notification types to preference keys
    const shouldSendEmail =
      (notificationType === 'new_conversation' && preferences.new_conversation) ||
      ((notificationType === 'analysis_complete' || notificationType === 'report_generated') &&
        preferences.conversation_progress);

    if (!shouldSendEmail) {
      return NextResponse.json({ success: true, skipped: 'preference_disabled' });
    }

    // 5. Get user email
    const email = await getUserEmail(supabase, user_id);
    if (!email) {
      return NextResponse.json({ success: false, error: 'No email address' });
    }

    // 6. Send email
    const result = await sendNotificationEmail(
      email,
      notificationType,
      notification.title,
      notification.body,
      notification.linkPath
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/notifications/email] Error:', error);
    return jsonError('Internal server error', 500);
  }
}
```

**Step 4: Create PATCH /api/profile/notifications**

```typescript
// app/api/profile/notifications/route.ts

/**
 * Notification Preferences API
 *
 * GET - Get current email preferences
 * PATCH - Update email preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server/requireAuth';
import { supabaseServerClient } from '@/lib/supabase/serverClient';
import { jsonError } from '@/lib/api/errors';
import { updateEmailPreferencesSchema } from '@/lib/notifications/server/schemas';
import {
  getEmailPreferences,
  updateEmailPreferences,
} from '@/lib/notifications/server/notificationService';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError('Unauthorised', 401);
    }

    const supabase = await supabaseServerClient();
    const preferences = await getEmailPreferences(supabase, session.user.id);

    return NextResponse.json({ email_preferences: preferences });
  } catch (error) {
    console.error('[GET /api/profile/notifications] Error:', error);
    return jsonError('Internal server error', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError('Unauthorised', 401);
    }

    const body = await request.json();
    const parsed = updateEmailPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Invalid request body', 400);
    }

    const supabase = await supabaseServerClient();
    const updated = await updateEmailPreferences(
      supabase,
      session.user.id,
      parsed.data.email_preferences
    );

    return NextResponse.json({ email_preferences: updated });
  } catch (error) {
    console.error('[PATCH /api/profile/notifications] Error:', error);
    return jsonError('Internal server error', 500);
  }
}
```

**Step 5: Commit**

```bash
git add app/api/notifications/ app/api/profile/notifications/
git commit -m "feat(api): add notification API endpoints"
```

---

## Task 6: Create useNotifications Hook

**Files:**
- Create: `lib/notifications/hooks/useNotifications.ts`

**Step 1: Create the hook**

```typescript
// lib/notifications/hooks/useNotifications.ts

'use client';

/**
 * useNotifications Hook
 *
 * Real-time notifications hook following the useHiveReactions pattern.
 * Subscribes to postgres_changes on user_notifications table.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Notification, NotificationRow } from '../domain/notification.types';

type NotificationStatus = 'connecting' | 'connected' | 'error' | 'disconnected';

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  status: NotificationStatus;
  markAllRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

function mapRowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as Notification['type'],
    title: row.title,
    body: row.body,
    hiveId: row.hive_id,
    conversationId: row.conversation_id,
    responseId: row.response_id ? String(row.response_id) : null,
    linkPath: row.link_path,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function useNotifications(userId: string | undefined): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<NotificationStatus>('disconnected');
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch notifications from API
  const refresh = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch('/api/notifications');
      if (!response.ok) {
        console.error('[useNotifications] Refresh failed:', response.status);
        return;
      }

      const data = await response.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (err) {
      console.error('[useNotifications] Refresh error:', err);
    }
  }, [userId]);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch('/api/notifications/read', { method: 'PATCH' });
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('[useNotifications] markAllRead error:', err);
    }
  }, [userId]);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch('/api/notifications', { method: 'DELETE' });
      if (response.ok) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('[useNotifications] clearAll error:', err);
    }
  }, [userId]);

  // Handle new notification from realtime
  const handleNewNotification = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === 'INSERT' && payload.new) {
        const row = payload.new as unknown as NotificationRow;
        const newNotification = mapRowToNotification(row);

        setNotifications((prev) => [newNotification, ...prev].slice(0, 20));
        setUnreadCount((prev) => prev + 1);
      }
    },
    []
  );

  // Set up realtime subscription
  useEffect(() => {
    if (!supabase || !userId) {
      return;
    }

    // Initial fetch
    refresh();

    queueMicrotask(() => setStatus('connecting'));

    const channelName = `user:${userId}:notifications`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        handleNewNotification
      )
      .subscribe((subscriptionStatus, err) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('connected');
        } else if (subscriptionStatus === 'CHANNEL_ERROR' || err) {
          setStatus('error');
        } else if (subscriptionStatus === 'CLOSED') {
          setStatus('disconnected');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, handleNewNotification, refresh]);

  return {
    notifications,
    unreadCount,
    status,
    markAllRead,
    clearAll,
    refresh,
  };
}
```

**Step 2: Commit**

```bash
git add lib/notifications/hooks/useNotifications.ts
git commit -m "feat(notifications): add useNotifications real-time hook"
```

---

## Task 7: Create Notification Bell Component

**Files:**
- Create: `app/components/navbar/NotificationBell.tsx`
- Create: `app/components/navbar/NotificationDropdown.tsx`

**Step 1: Create NotificationDropdown**

```typescript
// app/components/navbar/NotificationDropdown.tsx

'use client';

/**
 * Notification Dropdown
 *
 * Dropdown list showing recent notifications with click navigation.
 */

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  BarChart3,
  FileText,
  Heart,
  Trash2,
} from 'lucide-react';
import type { Notification, NotificationType } from '@/lib/notifications/domain/notification.types';

interface NotificationDropdownProps {
  notifications: Notification[];
  onClearAll: () => void;
  onClose: () => void;
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'new_conversation':
      return <MessageSquare className="w-4 h-4 text-blue-500" />;
    case 'analysis_complete':
      return <BarChart3 className="w-4 h-4 text-green-500" />;
    case 'report_generated':
      return <FileText className="w-4 h-4 text-purple-500" />;
    case 'opinion_liked':
      return <Heart className="w-4 h-4 text-red-500" />;
    default:
      return <MessageSquare className="w-4 h-4 text-slate-500" />;
  }
}

export default function NotificationDropdown({
  notifications,
  onClearAll,
  onClose,
}: NotificationDropdownProps) {
  const router = useRouter();

  const handleNotificationClick = (notification: Notification) => {
    router.push(notification.linkPath);
    onClose();
  };

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-medium text-slate-900">Notifications</h3>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500">
            No notifications
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => handleNotificationClick(notification)}
              className={`w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-50 last:border-b-0 flex gap-3 ${
                !notification.readAt ? 'bg-blue-50/50' : ''
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getNotificationIcon(notification.type as NotificationType)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {notification.title}
                </p>
                {notification.body && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {notification.body}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                </p>
              </div>
              {!notification.readAt && (
                <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-1.5" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create NotificationBell**

```typescript
// app/components/navbar/NotificationBell.tsx

'use client';

/**
 * Notification Bell
 *
 * Bell icon with unread count badge and dropdown.
 * Marks notifications as read when dropdown opens.
 */

import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/lib/notifications/hooks/useNotifications';
import NotificationDropdown from './NotificationDropdown';

interface NotificationBellProps {
  userId: string;
}

export default function NotificationBell({ userId }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications(userId);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Mark as read when dropdown opens
  useEffect(() => {
    if (isOpen && unreadCount > 0) {
      markAllRead();
    }
  }, [isOpen, unreadCount, markAllRead]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleClearAll = () => {
    clearAll();
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-2 hover:bg-slate-100 rounded-md transition"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationDropdown
          notifications={notifications}
          onClearAll={handleClearAll}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add app/components/navbar/NotificationBell.tsx app/components/navbar/NotificationDropdown.tsx
git commit -m "feat(ui): add NotificationBell and NotificationDropdown components"
```

---

## Task 8: Integrate Bell into Navbar

**Files:**
- Modify: `app/components/Navbar.tsx`
- Modify: `types/navbar.ts`

**Step 1: Update NavbarViewModel type to include userId**

```typescript
// types/navbar.ts - add userId to NavbarViewModel

export interface NavbarViewModel {
  user: NavbarUser | null;
  userId: string | null;  // Add this line
  hives: HiveOption[];
  currentHive: CurrentHive | null;
  currentPage: NavbarPage;
}
```

**Step 2: Update Navbar to include NotificationBell**

Modify the right side of the desktop navbar in `app/components/Navbar.tsx`:

```typescript
// Add import at top
import NotificationBell from "./navbar/NotificationBell";

// Replace the desktop user menu section (around line 93-95)
// From:
//   user && <UserMenu user={user} />
// To:
//   user && (
//     <div className="flex items-center gap-2">
//       {viewModel.userId && <NotificationBell userId={viewModel.userId} />}
//       <UserMenu user={user} />
//     </div>
//   )
```

**Step 3: Update navbar view model builder to include userId**

Find where NavbarViewModel is built (likely in `lib/navbar/` or the layout file) and add the userId field from the session.

**Step 4: Verify the integration**

Run: `npm run dev`
Navigate to the app, verify bell icon appears next to user menu

**Step 5: Commit**

```bash
git add app/components/Navbar.tsx types/navbar.ts lib/navbar/
git commit -m "feat(navbar): integrate notification bell"
```

---

## Task 9: Add Notification Preferences to Settings

**Files:**
- Create: `lib/notifications/hooks/useNotificationPreferences.ts`
- Modify: `app/settings/page.tsx`
- Modify: `app/settings/AccountSettingsForm.tsx`

**Step 1: Create useNotificationPreferences hook**

```typescript
// lib/notifications/hooks/useNotificationPreferences.ts

'use client';

/**
 * useNotificationPreferences Hook
 *
 * Fetches and updates email notification preferences.
 */

import { useState, useEffect, useCallback } from 'react';
import type { EmailPreferences } from '../domain/notification.types';

interface UseNotificationPreferencesResult {
  preferences: EmailPreferences | null;
  loading: boolean;
  error: string | null;
  updatePreferences: (updates: Partial<EmailPreferences>) => Promise<void>;
}

export function useNotificationPreferences(): UseNotificationPreferencesResult {
  const [preferences, setPreferences] = useState<EmailPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch preferences
  useEffect(() => {
    async function fetchPreferences() {
      try {
        const response = await fetch('/api/profile/notifications');
        if (!response.ok) {
          throw new Error('Failed to fetch preferences');
        }
        const data = await response.json();
        setPreferences(data.email_preferences);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchPreferences();
  }, []);

  // Update preferences
  const updatePreferences = useCallback(async (updates: Partial<EmailPreferences>) => {
    if (!preferences) return;

    const optimisticUpdate = { ...preferences, ...updates };
    setPreferences(optimisticUpdate);

    try {
      const response = await fetch('/api/profile/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_preferences: updates }),
      });

      if (!response.ok) {
        // Rollback on error
        setPreferences(preferences);
        throw new Error('Failed to update preferences');
      }

      const data = await response.json();
      setPreferences(data.email_preferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [preferences]);

  return { preferences, loading, error, updatePreferences };
}
```

**Step 2: Add NotificationPreferencesSection component**

Create a new component or add to AccountSettingsForm:

```typescript
// Add to app/settings/AccountSettingsForm.tsx or create separate component

'use client';

import { useNotificationPreferences } from '@/lib/notifications/hooks/useNotificationPreferences';

function NotificationPreferencesSection() {
  const { preferences, loading, updatePreferences } = useNotificationPreferences();

  if (loading || !preferences) {
    return <div className="animate-pulse h-24 bg-slate-100 rounded" />;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-slate-900">Email Notifications</h3>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={preferences.new_conversation}
          onChange={(e) => updatePreferences({ new_conversation: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <span className="text-sm font-medium text-slate-700">New conversations</span>
          <p className="text-xs text-slate-500">
            Receive an email when a new conversation starts in your Hives
          </p>
        </div>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={preferences.conversation_progress}
          onChange={(e) => updatePreferences({ conversation_progress: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <span className="text-sm font-medium text-slate-700">Conversation progress</span>
          <p className="text-xs text-slate-500">
            Receive an email when a conversation you contributed to has new analysis or reports
          </p>
        </div>
      </label>
    </div>
  );
}
```

**Step 3: Add section to settings page**

Add `<NotificationPreferencesSection />` to the settings form with appropriate spacing.

**Step 4: Commit**

```bash
git add lib/notifications/hooks/useNotificationPreferences.ts app/settings/
git commit -m "feat(settings): add notification preferences UI"
```

---

## Task 10: Add Email Trigger to Database (pg_net)

**Files:**
- Modify: `supabase/migrations/038_create_notifications.sql`

**Step 1: Update triggers to call email API**

Add pg_net HTTP calls to triggers that should send emails. This requires pg_net extension to be enabled.

```sql
-- Add to the trigger functions that should send emails

-- Example for notify_new_conversation (add after INSERT statement):
-- Note: pg_net must be enabled in Supabase dashboard

PERFORM net.http_post(
  url := current_setting('app.settings.app_url', true) || '/api/notifications/email',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.settings.internal_api_key', true)
  ),
  body := jsonb_build_object(
    'notification_id', (SELECT id FROM user_notifications WHERE user_id = m.user_id ORDER BY created_at DESC LIMIT 1),
    'user_id', m.user_id
  )
);
```

**Note:** This step may need adjustment based on your Supabase setup. The pg_net extension needs to be enabled and configured with the appropriate settings.

**Step 2: Alternative - Use Edge Function or Application-Level Email**

If pg_net is not available or too complex, emails can be sent from the application layer by:
1. Listening to realtime events in a server process
2. Or calling the email API from the notification service when creating notifications via the app

**Step 3: Commit**

```bash
git add supabase/migrations/038_create_notifications.sql
git commit -m "feat(db): add email triggers via pg_net"
```

---

## Task 11: Update Documentation

**Files:**
- Modify: `docs/feature-map.md`
- Modify: `docs/setup/README.md`

**Step 1: Add notifications to feature-map.md**

```markdown
### Notifications

- In-app notifications: `lib/notifications/hooks/useNotifications.ts`
- Email service: `lib/notifications/server/emailService.ts`
- Notification service: `lib/notifications/server/notificationService.ts`
- API routes: `app/api/notifications/`
- UI components: `app/components/navbar/NotificationBell.tsx`
- Database triggers: `supabase/migrations/038_create_notifications.sql`
```

**Step 2: Add env vars to setup docs**

```markdown
### Email Notifications (Optional)

```env
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM="Hivemind <noreply@yourdomain.com>"
INTERNAL_API_KEY=your-internal-api-key
```
```

**Step 3: Commit**

```bash
git add docs/feature-map.md docs/setup/README.md
git commit -m "docs: add notifications feature documentation"
```

---

## Task 12: Run Tests and Final Verification

**Step 1: Run linting**

Run: `npm run lint`
Expected: No errors

**Step 2: Run type checking**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Manual testing checklist**

- [ ] Bell icon appears in navbar (desktop)
- [ ] Unread count badge shows when notifications exist
- [ ] Clicking bell opens dropdown
- [ ] Notifications appear in dropdown
- [ ] Clicking notification navigates to correct page
- [ ] Opening dropdown marks notifications as read
- [ ] "Clear all" removes all notifications
- [ ] Creating a conversation creates notifications for other members
- [ ] Email preferences toggles work in settings
- [ ] Emails are sent (if SMTP configured)

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(notifications): complete notification system implementation"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Types and schemas |
| 2 | Database migration (table, triggers, RLS) |
| 3 | Email service with Nodemailer |
| 4 | Notification service (CRUD operations) |
| 5 | API endpoints |
| 6 | useNotifications real-time hook |
| 7 | NotificationBell and Dropdown components |
| 8 | Navbar integration |
| 9 | Settings preferences UI |
| 10 | Email trigger integration |
| 11 | Documentation updates |
| 12 | Testing and verification |
