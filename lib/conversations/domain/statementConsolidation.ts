/**
 * Statement Consolidation - Domain Logic
 *
 * Pure functions for preparing groups for LLM synthesis and formatting
 * provenance data. Follows SRP: no IO, just data transformation.
 */

/**
 * Input for consolidation - a group with its member responses
 */
export interface ConsolidationInput {
  groupId: string;
  clusterIndex: number;
  representativeId: string;
  responses: Array<{
    id: string;
    text: string;
  }>;
}

/**
 * Output from consolidation - synthesized statement with provenance
 */
export interface ConsolidationOutput {
  groupId: string;
  synthesizedStatement: string;
  combinedResponseIds: string[];
  combinedResponses: string; // "id: text | id: text" format
}

/**
 * Format responses into provenance string
 *
 * @param responses - Array of response id/text pairs
 * @returns Formatted string "id: text | id: text | ..."
 */
export function formatCombinedResponses(
  responses: Array<{ id: string; text: string }>
): string {
  return responses.map((r) => `${r.id}: ${r.text}`).join(" | ");
}

/**
 * Filter groups eligible for consolidation
 *
 * Only groups with 2+ members benefit from synthesis.
 * Single-member groups would just return their own text.
 *
 * @param groups - All groups to filter
 * @returns Groups with 2 or more responses
 */
export function filterEligibleGroups(
  groups: ConsolidationInput[]
): ConsolidationInput[] {
  return groups.filter((g) => g.responses.length >= 2);
}

/**
 * Build synthesis context for a group
 *
 * Extracts the data needed for LLM synthesis.
 *
 * @param group - Group to prepare
 * @returns Context object with response texts and cluster info
 */
export function buildSynthesisContext(group: ConsolidationInput): {
  responses: string[];
  clusterIndex: number;
} {
  return {
    responses: group.responses.map((r) => r.text),
    clusterIndex: group.clusterIndex,
  };
}

/**
 * Build consolidation output from synthesis result
 *
 * @param group - Original group input
 * @param synthesizedStatement - LLM-generated statement
 * @returns Complete consolidation output with provenance
 */
export function buildConsolidationOutput(
  group: ConsolidationInput,
  synthesizedStatement: string
): ConsolidationOutput {
  return {
    groupId: group.groupId,
    synthesizedStatement,
    combinedResponseIds: group.responses.map((r) => r.id),
    combinedResponses: formatCombinedResponses(group.responses),
  };
}
