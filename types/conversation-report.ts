/**
 * Report Tab Types
 *
 * Type definitions for the Report/Result experience
 * Includes report generation, versioning, and display
 */

/**
 * Report content format
 * Can be HTML string, structured markdown object, or null
 */
export type ReportContent =
  | string
  | { markdown?: string; [key: string]: unknown }
  | null;

/**
 * Single report version with timestamp
 */
export interface ReportVersion {
  version: number;
  createdAt: string | null;
  html: string;
}

/**
 * Report access gate result
 * Determines if report can be opened/generated
 */
export interface ReportGate {
  allowed: boolean;
  reason?: string;
}

/**
 * Optional agreement summaries for left column
 */
export interface AgreementSummary {
  id: string;
  responseText: string;
  agreePercent: number;
  totalVotes: number;
  type: "agreement" | "divisive";
}

/**
 * Complete view model for Result page
 * Assembled server-side and passed to client component
 */
export interface ResultViewModel {
  conversationId: string;
  report: ReportContent;
  versions: ReportVersion[];
  responseCount: number;
  canGenerate: boolean;
  gateReason?: string | null;
  agreementSummaries?: AgreementSummary[];
}
