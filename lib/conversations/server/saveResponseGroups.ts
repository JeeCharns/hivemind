/**
 * Save Response Groups
 *
 * Persists "frequently mentioned" groups to database
 * Called during analysis pipeline after similarity grouping
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResponseGroup, GroupingParams } from "../domain/similarityGrouping";

/**
 * Save response groups to database
 *
 * @param supabase - Supabase client (service role)
 * @param conversationId - Conversation UUID
 * @param groups - Response groups from similarity grouping
 * @param params - Grouping parameters for observability
 */
export async function saveResponseGroups(
  supabase: SupabaseClient,
  conversationId: string,
  groups: ResponseGroup[],
  params: GroupingParams
): Promise<void> {
  console.log(
    `[saveResponseGroups] Saving ${groups.length} groups for ${conversationId}`
  );

  // Delete existing groups for this conversation (full re-analysis)
  const { error: deleteError } = await supabase
    .from("conversation_response_groups")
    .delete()
    .eq("conversation_id", conversationId);

  if (deleteError) {
    console.error("[saveResponseGroups] Failed to delete old groups:", deleteError);
    throw new Error(`Failed to delete old groups: ${deleteError.message}`);
  }

  if (groups.length === 0) {
    console.log("[saveResponseGroups] No groups to save");
    return;
  }

  // Insert new groups
  const groupRows = groups.map((group) => ({
    conversation_id: conversationId,
    cluster_index: group.clusterIndex,
    representative_response_id: group.representativeId,
    group_size: group.size,
    params: {
      sim_threshold: params.simThreshold,
      min_group_size: params.minGroupSize,
      algorithm_version: params.algorithmVersion,
    },
  }));

  const { data: insertedGroups, error: insertError } = await supabase
    .from("conversation_response_groups")
    .insert(groupRows)
    .select("id");

  if (insertError || !insertedGroups) {
    console.error("[saveResponseGroups] Failed to insert groups:", insertError);
    throw new Error(`Failed to insert groups: ${insertError?.message}`);
  }

  console.log(`[saveResponseGroups] Inserted ${insertedGroups.length} groups`);

  // Insert group members
  const memberRows: Array<{ group_id: string; response_id: string }> = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const groupId = insertedGroups[i].id;

    for (const memberId of group.memberIds) {
      memberRows.push({
        group_id: groupId,
        response_id: memberId,
      });
    }
  }

  if (memberRows.length > 0) {
    // Insert in batches (avoid overwhelming database)
    const BATCH_SIZE = 500;
    for (let i = 0; i < memberRows.length; i += BATCH_SIZE) {
      const batch = memberRows.slice(i, Math.min(i + BATCH_SIZE, memberRows.length));

      const { error } = await supabase
        .from("conversation_response_group_members")
        .insert(batch);

      if (error) {
        console.error(
          `[saveResponseGroups] Failed to save member batch ${i / BATCH_SIZE + 1}:`,
          error
        );
        throw new Error(`Failed to save group members: ${error.message}`);
      }

      console.log(
        `[saveResponseGroups] Saved member batch ${i / BATCH_SIZE + 1} (${batch.length} members)`
      );
    }
  }

  console.log(
    `[saveResponseGroups] Successfully saved ${groups.length} groups with ${memberRows.length} members`
  );

  // Log group stats for observability
  const groupSizeDistribution = groups.reduce((acc, group) => {
    acc[group.size] = (acc[group.size] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const totalResponsesGrouped = memberRows.length;
  console.log(`[saveResponseGroups] Group stats:`, {
    groupCount: groups.length,
    totalResponsesGrouped,
    sizeDistribution: groupSizeDistribution,
  });
}
