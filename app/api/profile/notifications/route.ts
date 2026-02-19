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
