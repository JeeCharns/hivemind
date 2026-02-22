/**
 * Notifications API
 *
 * GET - Fetch user's notifications
 * DELETE - Clear all notifications
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import {
  getNotifications,
  getUnreadCount,
  clearAllNotifications,
} from "@/lib/notifications/server/notificationService";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised", 401);
    }

    const supabase = await supabaseServerClient();
    const [notifications, unreadCount] = await Promise.all([
      getNotifications(supabase, session.user.id),
      getUnreadCount(supabase, session.user.id),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("[GET /api/notifications] Error:", error);
    return jsonError("Internal server error", 500);
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised", 401);
    }

    const supabase = await supabaseServerClient();
    await clearAllNotifications(supabase, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/notifications] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
