import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityEvent, ActivityEventInput } from "../types";

/**
 * Logs an activity event to the hive_activity table.
 */
export async function logActivity(
  supabase: SupabaseClient,
  input: ActivityEventInput
): Promise<void> {
  const { error } = await supabase.from("hive_activity").insert({
    hive_id: input.hiveId,
    event_type: input.eventType,
    user_id: input.userId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error("[logActivity] Error:", error);
    // Don't throw - activity logging is non-critical
  }
}

/**
 * Fetches recent activity events for a hive.
 */
export async function getRecentActivity(
  supabase: SupabaseClient,
  hiveId: string,
  limit: number = 15
): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from("hive_activity")
    .select("id, hive_id, event_type, user_id, metadata, created_at")
    .eq("hive_id", hiveId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getRecentActivity] Error:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    hiveId: row.hive_id,
    eventType: row.event_type,
    userId: row.user_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }));
}
