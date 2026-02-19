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
import { supabaseAdminClient } from '@/lib/supabase/adminClient';
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
    const supabase = supabaseAdminClient();
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
