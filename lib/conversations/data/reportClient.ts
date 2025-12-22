/**
 * Report Client - Data Access Layer
 *
 * Client for generating report versions
 * Follows DIP: interface allows for mocking in tests
 */

import type { AgreementSummary, ConsensusItem } from "@/types/conversation-report";

/**
 * Result from report generation
 */
export interface GenerateReportResult {
  success: boolean;
  report?: string;
  version?: number;
  createdAt?: string | null;
  agreementSummaries?: AgreementSummary[];
  consensusItems?: ConsensusItem[];
  totalInteractions?: number;
  error?: string;
}

/**
 * Interface for conversation report client
 * Allows for dependency injection and testing
 */
export interface IConversationReportClient {
  generate(conversationId: string): Promise<GenerateReportResult>;
}

/**
 * Default implementation using fetch API
 */
export class ConversationReportClient implements IConversationReportClient {
  async generate(conversationId: string): Promise<GenerateReportResult> {
    const response = await fetch(`/api/conversations/${conversationId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to generate report" }));
      return {
        success: false,
        error: error.error || "Failed to generate report",
      };
    }

    const data = await response.json();
    return {
      success: true,
      report: data.report,
      version: data.version,
      createdAt: data.createdAt || data.created_at || null,
      agreementSummaries: data.agreementSummaries,
      consensusItems: data.consensusItems,
      totalInteractions:
        typeof data.totalInteractions === "number" ? data.totalInteractions : 0,
    };
  }
}

/**
 * Default client instance
 */
export const reportClient = new ConversationReportClient();
