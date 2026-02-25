/**
 * Guest Session Migration Service
 *
 * Migrates guest contributions (responses, likes, feedback) to a user account.
 * Also auto-joins the user to relevant hives.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface MigrateGuestSessionParams {
  userId: string;
  guestSessionId: string;
  keepAnonymous: boolean;
}

export interface MigrateGuestSessionResult {
  responsesCount: number;
  likesCount: number;
  feedbackCount: number;
  hiveIds: string[];
}

/**
 * Migrate a guest session to a user account.
 * Updates all responses, likes, and feedback to the new user_id.
 * Auto-joins the user to all hives they participated in.
 */
export async function migrateGuestSession(
  adminClient: SupabaseClient,
  params: MigrateGuestSessionParams
): Promise<MigrateGuestSessionResult> {
  const { userId, guestSessionId, keepAnonymous } = params;

  const { data, error } = await adminClient.rpc("migrate_guest_session", {
    p_user_id: userId,
    p_guest_session_id: guestSessionId,
    p_keep_anonymous: keepAnonymous,
  });

  if (error || !data) {
    console.error("[migrateGuestSession] Failed:", error);
    throw new Error("Failed to migrate guest session");
  }

  console.log(
    `[guest-migration] Migrated session ${guestSessionId} to user ${userId}: ` +
      `${data.responses_count} responses, ${data.likes_count} likes, ${data.feedback_count} feedback`
  );

  return {
    responsesCount: data.responses_count,
    likesCount: data.likes_count,
    feedbackCount: data.feedback_count,
    hiveIds: data.hive_ids || [],
  };
}
