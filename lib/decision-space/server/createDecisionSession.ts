import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateDecisionSessionInput } from "@/lib/decision-space/schemas";

export interface CreateDecisionSessionResult {
  conversationId: string;
  slug: string | null;
  roundId: string;
}

/**
 * Create a new decision session with proposals and first voting round
 */
export async function createDecisionSession(
  supabase: SupabaseClient,
  userId: string,
  input: CreateDecisionSessionInput
): Promise<CreateDecisionSessionResult> {
  const {
    hiveId,
    sourceConversationId,
    title,
    description,
    selectedStatements,
    visibility,
    deadline,
  } = input;

  // 1. Verify source conversation exists and is valid
  const { data: sourceConv, error: sourceError } = await supabase
    .from("conversations")
    .select("id, hive_id, type, analysis_status")
    .eq("id", sourceConversationId)
    .maybeSingle();

  if (sourceError || !sourceConv) {
    throw new Error("Source conversation not found");
  }

  if (sourceConv.hive_id !== hiveId) {
    throw new Error("Source conversation must be in the same hive");
  }

  if (sourceConv.type !== "understand") {
    throw new Error("Source must be an understand session");
  }

  if (sourceConv.analysis_status !== "ready") {
    throw new Error("Source analysis must be complete");
  }

  // 2. Verify user is hive member
  const { data: membership, error: memberError } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", hiveId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError || !membership) {
    throw new Error("User is not a member of this hive");
  }

  // 3. Create the conversation
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      hive_id: hiveId,
      type: "decide",
      title,
      description: description || null,
      phase: "vote_open",
      analysis_status: "ready",
      created_by: userId,
      source_conversation_id: sourceConversationId,
    })
    .select("id, slug")
    .single();

  if (convError || !conversation) {
    console.error("[createDecisionSession] Failed to create conversation:", convError);
    throw new Error("Failed to create decision session");
  }

  // 4. Create proposals from selected statements
  const proposals = selectedStatements.map((stmt, index) => ({
    conversation_id: conversation.id,
    source_bucket_id: stmt.bucketId,
    source_cluster_index: stmt.clusterIndex,
    statement_text: stmt.statementText,
    original_agree_percent: stmt.agreePercent,
    display_order: index,
  }));

  const { error: proposalsError } = await supabase
    .from("decision_proposals")
    .insert(proposals);

  if (proposalsError) {
    console.error("[createDecisionSession] Failed to create proposals:", proposalsError);
    await supabase.from("conversations").delete().eq("id", conversation.id);
    throw new Error("Failed to create proposals");
  }

  // 5. Create first voting round
  const { data: round, error: roundError } = await supabase
    .from("decision_rounds")
    .insert({
      conversation_id: conversation.id,
      round_number: 1,
      status: "voting_open",
      visibility: visibility,
      deadline: deadline || null,
    })
    .select("id")
    .single();

  if (roundError || !round) {
    console.error("[createDecisionSession] Failed to create round:", roundError);
    await supabase.from("conversations").delete().eq("id", conversation.id);
    throw new Error("Failed to create voting round");
  }

  return {
    conversationId: conversation.id,
    slug: conversation.slug,
    roundId: round.id,
  };
}
