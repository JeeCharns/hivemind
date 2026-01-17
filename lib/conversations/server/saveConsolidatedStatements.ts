/**
 * Save Consolidated Statements
 *
 * Persists LLM-synthesized statements to database.
 * Called during analysis pipeline after similarity grouping.
 *
 * Follows patterns from saveResponseGroups.ts:
 * - Delete existing before insert (idempotent re-analysis)
 * - Detailed logging for observability
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsolidationOutput } from "../domain/statementConsolidation";
import { DEFAULT_SYNTHESIS_PARAMS } from "@/lib/analysis/openai/statementSynthesizer";

/**
 * Save consolidated statements to database
 *
 * @param supabase - Supabase client (service role)
 * @param conversationId - Conversation UUID
 * @param statements - Consolidation outputs with synthesized statements
 */
export async function saveConsolidatedStatements(
  supabase: SupabaseClient,
  conversationId: string,
  statements: ConsolidationOutput[]
): Promise<void> {
  console.log(
    `[saveConsolidatedStatements] Saving ${statements.length} statements for ${conversationId}`
  );

  // Delete existing statements for this conversation (full re-analysis is idempotent)
  const { error: deleteError } = await supabase
    .from("conversation_consolidated_statements")
    .delete()
    .eq("conversation_id", conversationId);

  if (deleteError) {
    console.error(
      "[saveConsolidatedStatements] Failed to delete old statements:",
      deleteError
    );
    throw new Error(`Failed to delete old statements: ${deleteError.message}`);
  }

  if (statements.length === 0) {
    console.log("[saveConsolidatedStatements] No statements to save");
    return;
  }

  // Prepare rows for insert
  const rows = statements.map((s) => ({
    conversation_id: conversationId,
    group_id: s.groupId,
    synthesized_statement: s.synthesizedStatement,
    combined_response_ids: s.combinedResponseIds.map((id) =>
      typeof id === "string" ? parseInt(id, 10) : id
    ),
    combined_responses: s.combinedResponses,
    model_used: DEFAULT_SYNTHESIS_PARAMS.model,
    prompt_version: DEFAULT_SYNTHESIS_PARAMS.promptVersion,
  }));

  // Insert all statements
  const { error: insertError } = await supabase
    .from("conversation_consolidated_statements")
    .insert(rows);

  if (insertError) {
    console.error(
      "[saveConsolidatedStatements] Failed to insert statements:",
      insertError
    );
    throw new Error(`Failed to save statements: ${insertError.message}`);
  }

  console.log(
    `[saveConsolidatedStatements] Successfully saved ${statements.length} statements`
  );

  // Log stats for observability
  const avgResponsesPerGroup =
    statements.reduce((sum, s) => sum + s.combinedResponseIds.length, 0) /
    statements.length;

  console.log(`[saveConsolidatedStatements] Stats:`, {
    statementCount: statements.length,
    totalResponsesConsolidated: statements.reduce(
      (sum, s) => sum + s.combinedResponseIds.length,
      0
    ),
    avgResponsesPerGroup: avgResponsesPerGroup.toFixed(1),
  });
}
