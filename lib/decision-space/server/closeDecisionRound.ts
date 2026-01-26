// lib/decision-space/server/closeDecisionRound.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDecisionResults } from "./generateDecisionResults";

export interface CloseDecisionRoundResult {
  roundId: string;
  resultsGenerated: boolean;
}

/**
 * Close a voting round and trigger results generation
 */
export async function closeDecisionRound(
  supabase: SupabaseClient,
  userId: string,
  roundId: string
): Promise<CloseDecisionRoundResult> {
  // 1. Fetch round and verify ownership
  const { data: round, error: roundError } = await supabase
    .from("decision_rounds")
    .select(`
      id,
      conversation_id,
      status,
      conversations!inner (
        hive_id
      )
    `)
    .eq("id", roundId)
    .maybeSingle();

  if (roundError || !round) {
    throw new Error("Round not found");
  }

  if (round.status !== "voting_open") {
    throw new Error("Round is not open for voting");
  }

  // 2. Verify user is hive admin
  const hiveId = (round.conversations as { hive_id: string }).hive_id;
  const { data: membership } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", hiveId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || membership.role !== "admin") {
    throw new Error("Only hive admins can close voting rounds");
  }

  // 3. Close the round
  const { error: updateError } = await supabase
    .from("decision_rounds")
    .update({
      status: "voting_closed",
      closed_at: new Date().toISOString(),
    })
    .eq("id", roundId);

  if (updateError) {
    throw new Error("Failed to close round");
  }

  // 4. Generate results
  try {
    await generateDecisionResults(supabase, roundId);

    // Update status to results_generated
    await supabase
      .from("decision_rounds")
      .update({ status: "results_generated" })
      .eq("id", roundId);

    return { roundId, resultsGenerated: true };
  } catch (err) {
    console.error("[closeDecisionRound] Results generation failed:", err);
    return { roundId, resultsGenerated: false };
  }
}
