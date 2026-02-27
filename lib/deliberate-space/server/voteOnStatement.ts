/**
 * Vote On Statement Service
 *
 * Handles casting, updating, or removing votes on deliberation statements.
 * Supports both authenticated users and guests via share links.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoteOnStatementInput } from "@/lib/deliberate-space/schemas";

interface VoteOnStatementParams extends VoteOnStatementInput {
  userId?: string;
  guestSessionId?: string;
}

export interface VoteOnStatementResult {
  success: boolean;
  voteValue: number | null;
}

/**
 * Cast, update, or remove a vote on a statement
 *
 * @param supabase - Supabase client with auth
 * @param params - Statement ID, vote value, and user/guest identifiers
 * @returns Success status and final vote value
 * @throws Error if user/guest not provided or statement not found
 */
export async function voteOnStatement(
  supabase: SupabaseClient,
  params: VoteOnStatementParams
): Promise<VoteOnStatementResult> {
  const { statementId, voteValue, userId, guestSessionId } = params;

  if (!userId && !guestSessionId) {
    throw new Error("Must provide userId or guestSessionId");
  }

  // Verify statement exists
  const { data: statement, error: stmtError } = await supabase
    .from("deliberation_statements")
    .select("id")
    .eq("id", statementId)
    .maybeSingle();

  if (stmtError || !statement) {
    throw new Error("Statement not found");
  }

  // If voteValue is null, remove vote (pass)
  if (voteValue === null) {
    let deleteQuery = supabase
      .from("deliberation_votes")
      .delete()
      .eq("statement_id", statementId);

    if (userId) {
      deleteQuery = deleteQuery.eq("user_id", userId);
    } else {
      deleteQuery = deleteQuery.eq("guest_session_id", guestSessionId!);
    }

    await deleteQuery;
    return { success: true, voteValue: null };
  }

  // Upsert vote
  const voteData: Record<string, unknown> = {
    statement_id: statementId,
    vote_value: voteValue,
    updated_at: new Date().toISOString(),
  };

  if (userId) {
    voteData.user_id = userId;
  } else {
    voteData.guest_session_id = guestSessionId;
  }

  const { error: voteError } = await supabase
    .from("deliberation_votes")
    .upsert(voteData, {
      onConflict: userId
        ? "statement_id,user_id"
        : "statement_id,guest_session_id",
    });

  if (voteError) {
    console.error("[voteOnStatement] Failed to save vote:", voteError);
    throw new Error("Failed to save vote");
  }

  return { success: true, voteValue };
}
