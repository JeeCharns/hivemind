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
  passPercent: number;
  disagreePercent: number;
  totalVotes: number;
  type: "agreement" | "divisive";
}

export interface ConsensusItem {
  id: string;
  responseText: string;
  agreePercent: number;
  passPercent: number;
  disagreePercent: number;
  agreeVotes: number;
  passVotes: number;
  disagreeVotes: number;
  totalVotes: number;
}

/**
 * Metrics for the consensus matrix header
 */
export interface ConsensusMetrics {
  /** Total number of votes cast */
  totalVotes: number;
  /** Number of unique participants (people who submitted responses or voted) */
  totalParticipants: number;
  /** Number of unique voters (people who voted on at least one statement) */
  uniqueVoters: number;
  /** Total number of statements in the matrix */
  totalStatements: number;
  /** % of participants who have voted on at least one statement */
  participantVotingPercent: number;
  /** % of total possible votes that have been cast (votes / (participants * statements)) */
  voteCoveragePercent: number;
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
  totalInteractions: number;
  canGenerate: boolean;
  gateReason?: string | null;
  agreementSummaries?: AgreementSummary[];
  consensusItems: ConsensusItem[];
  consensusMetrics: ConsensusMetrics;
  analysisStatus:
    | "not_started"
    | "embedding"
    | "analyzing"
    | "ready"
    | "error"
    | null;
  analysisError?: string | null;
}
