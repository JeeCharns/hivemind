/**
 * Report Rules - Domain Logic
 *
 * Business rules for report generation and access
 * Follows SRP: pure functions, no side effects
 */

import type { ReportGate } from "@/types/conversation-report";
import type { ConversationPhase } from "@/types/conversations";
import { REPORT_MIN_RESPONSES } from "./thresholds";

/**
 * Minimum responses required to generate a report
 * Re-exported for backward compatibility with existing imports
 */
export const MIN_RESPONSES_FOR_REPORT = REPORT_MIN_RESPONSES;

/**
 * Determines if a report can be opened/generated
 *
 * Rules:
 * - Requires at least MIN_RESPONSES_FOR_REPORT responses
 * - Phase must be appropriate (report_open or closed)
 *
 * @param phase - Current conversation phase
 * @param responseCount - Number of responses submitted
 * @returns Gate result with allowed flag and optional reason
 */
export function canOpenReport(
  phase: ConversationPhase | string,
  responseCount: number
): ReportGate {
  // Check minimum response count
  if (responseCount < MIN_RESPONSES_FOR_REPORT) {
    return {
      allowed: false,
      reason: `Need at least ${MIN_RESPONSES_FOR_REPORT} responses to generate a report (currently ${responseCount})`,
    };
  }

  // Check phase - allow report_open and closed
  if (phase === "report_open" || phase === "closed") {
    return { allowed: true };
  }

  // Phase not yet at report stage, but has enough responses
  // Could auto-advance to report_open
  return {
    allowed: true,
    reason: "advance", // Signal that phase can be advanced
  };
}

/**
 * Determines if a user can generate a new report version
 *
 * Requirements:
 * - Must pass canOpenReport gate
 * - User must be hive admin
 * - Conversation type must be "understand"
 * - Analysis status must be "ready"
 *
 * @param isAdmin - Whether user is admin of the hive
 * @param conversationType - Type of conversation
 * @param analysisStatus - Current analysis status
 * @param gate - Result from canOpenReport
 * @returns true if user can generate
 */
export function canGenerateReport(
  isAdmin: boolean,
  conversationType: string,
  analysisStatus: string | null,
  gate: ReportGate
): boolean {
  if (!gate.allowed) return false;
  if (!isAdmin) return false;
  if (conversationType !== "understand") return false;
  if (analysisStatus !== "ready") return false;

  return true;
}
