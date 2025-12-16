/**
 * Conversation Types
 *
 * Domain types for conversations
 * Follows SRP: types are separate from logic
 */

export type ConversationType = "understand" | "decide";

export type ConversationPhase =
  | "listen_open"
  | "understand_open"
  | "respond_open"
  | "vote_open"
  | "report_open"
  | "closed"
  | string;

export type AnalysisStatus =
  | "not_started"
  | "embedding"
  | "analyzing"
  | "ready"
  | "error";

export interface ConversationRow {
  id: string;
  slug: string | null;
  hive_id: string;
  type: ConversationType;
  title: string | null;
  description: string | null;
  created_at: string;
  analysis_status: AnalysisStatus | null;
  report_json: unknown | null;
}

/**
 * Minimal conversation data for hive homepage cards
 */
export interface ConversationCardData {
  id: string;
  slug: string | null;
  type: ConversationType;
  title: string | null;
  description: string | null;
  created_at: string;
  analysis_status: AnalysisStatus | null;
  report_json: unknown | null;
}

/**
 * Conversation row summary with phase
 */
export interface ConversationRowSummary {
  id: string;
  slug: string | null;
  hive_id: string;
  title: string | null;
  type: ConversationType;
  phase: ConversationPhase;
  analysis_status: AnalysisStatus | null;
  report_json: unknown | null;
}

/**
 * View model for conversation header
 */
export interface ConversationHeaderViewModel {
  conversationId: string;
  hiveKey: string;
  conversationKey: string;
  title: string;
  currentTab: "listen" | "understand" | "result";
}

/**
 * View model for Listen tab
 */
export interface ListenViewModel {
  conversationId: string;
  hiveKey: string;
  conversationKey: string;
  initialAnalysisStatus: AnalysisStatus | null;
  currentUserDisplayName: string;
}

/**
 * View model for Understand tab
 */
export interface UnderstandViewModel {
  conversationId: string;
  hiveKey: string;
  conversationKey: string;
  responses: UnderstandResponse[];
  themes: ThemeData[];
  feedbackItems: FeedbackItem[];
}

/**
 * Response data for understand visualization
 */
export interface UnderstandResponse {
  id: string;
  text: string;
  tag: string | null;
  clusterIndex: number | null;
  x: number | null;
  y: number | null;
}

/**
 * Theme/cluster data
 */
export interface ThemeData {
  clusterIndex: number;
  name: string;
  description: string;
  size: number;
}

/**
 * Feedback aggregation item
 */
export interface FeedbackItem {
  responseId: string;
  upvotes: number;
  downvotes: number;
  userFeedback: "up" | "down" | null;
}

/**
 * View model for Result tab
 */
export interface ResultViewModel {
  conversationId: string;
  hiveKey: string;
  conversationKey: string;
  currentReport: ReportVersion | null;
  versions: ReportVersion[];
  responseCount: number;
  canGenerate: boolean;
  canGenerateReason?: string;
}

/**
 * Report version data
 */
export interface ReportVersion {
  version: number;
  html: string;
  createdAt: string;
  createdBy: string;
}
