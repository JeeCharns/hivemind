/**
 * Notification Service
 *
 * Server-side functions for fetching, updating, and deleting notifications.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Notification,
  NotificationRow,
  EmailPreferences,
} from "../domain/notification.types";
import { DEFAULT_EMAIL_PREFERENCES } from "../domain/notification.types";

function mapRowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as Notification["type"],
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
    .from("user_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[notificationService] getNotifications error:", error);
    throw new Error("Failed to fetch notifications");
  }

  return (data ?? []).map(mapRowToNotification);
}

export async function getUnreadCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("user_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    console.error("[notificationService] getUnreadCount error:", error);
    return 0;
  }

  return count ?? 0;
}

export async function markAllAsRead(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    console.error("[notificationService] markAllAsRead error:", error);
    throw new Error("Failed to mark notifications as read");
  }
}

export async function clearAllNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("user_notifications")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("[notificationService] clearAllNotifications error:", error);
    throw new Error("Failed to clear notifications");
  }
}

export async function getNotificationById(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string
): Promise<Notification | null> {
  const { data, error } = await supabase
    .from("user_notifications")
    .select("*")
    .eq("id", notificationId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    if (error) {
      console.error("[notificationService] getNotificationById error:", error);
    }
    return null;
  }

  return mapRowToNotification(data);
}

export async function getEmailPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<EmailPreferences> {
  const { data, error } = await supabase
    .from("profiles")
    .select("email_preferences")
    .eq("id", userId)
    .single();

  if (error || !data?.email_preferences) {
    return DEFAULT_EMAIL_PREFERENCES;
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
    .from("profiles")
    .update({ email_preferences: updated })
    .eq("id", userId);

  if (error) {
    console.error("[notificationService] updateEmailPreferences error:", error);
    throw new Error("Failed to update email preferences");
  }

  return updated;
}

/**
 * Get user's email address from Supabase Auth.
 *
 * Note: Requires a service-role Supabase client (supabaseAdmin) as it uses
 * the auth.admin API. Will fail with a regular authenticated client.
 */
export async function getUserEmail(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data?.user?.email) {
    console.error("[notificationService] getUserEmail error:", error);
    return null;
  }

  return data.user.email;
}
