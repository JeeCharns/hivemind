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
