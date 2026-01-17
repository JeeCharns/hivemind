/**
 * Understand Tab Types
 *
 * Type definitions for the Understand experience
 * Includes theme map visualization and feedback system
 */

/**
 * Feedback options for responses
 */
export type Feedback = "agree" | "pass" | "disagree";

/**
 * Response point for UMAP visualization
 * Represents a single response plotted on the theme map
 */
export interface ResponsePoint {
  id: string;
  responseText: string;
  tag: string | null;
  /**
   * Cluster assignment:
   * - null: Unanalyzed (no clustering performed yet)
   * - -1: Misc/outlier cluster (response doesn't fit well into any theme)
   * - 0..N-1: Regular theme clusters (0 = largest cluster)
   */
  clusterIndex: number | null;
  xUmap: number | null;
  yUmap: number | null;
}

/**
 * Theme cluster row from analysis
 * Represents a grouped cluster of similar responses
 */
export interface ThemeRow {
  /**
   * Cluster index:
   * - -1: Misc/outlier theme (responses that don't fit well into other themes)
   * - 0..N-1: Regular theme clusters (0 = largest cluster)
   */
  clusterIndex: number;
  name: string | null;
  description: string | null;
  size: number | null;
}

/**
 * Aggregated feedback counts per response
 */
export interface FeedbackCounts {
  agree: number;
  pass: number;
  disagree: number;
}

/**
 * Feedback item for a single response
 * Includes aggregated counts and current user's feedback
 */
export interface FeedbackItem {
  id: string;
  responseText: string;
  tag: string | null;
  /**
   * Cluster assignment:
   * - null: Unanalyzed
   * - -1: Misc/outlier cluster
   * - 0..N-1: Regular theme clusters
   */
  clusterIndex: number | null;
  counts: FeedbackCounts;
  current: Feedback | null;
}

/**
 * Frequently mentioned group (near-duplicates within a theme)
 */
export interface FrequentlyMentionedGroup {
  groupId: string;
  clusterIndex: number;
  representative: {
    id: string;
    responseText: string;
    tag: string | null;
    counts: FeedbackCounts;
    current: Feedback | null;
  };
  similarResponses: Array<{
    id: string;
    responseText: string;
    tag: string | null;
  }>;
  size: number;
  params: {
    simThreshold: number;
    minGroupSize: number;
    algorithmVersion: string;
  };
  /**
   * LLM-synthesized consolidated statement (if available)
   * When present, this should be displayed instead of the representative's text
   */
  consolidatedStatement?: string | null;
  /**
   * IDs of responses that were combined into the consolidated statement
   */
  combinedResponseIds?: string[];
  /**
   * Original responses in "id: text | id: text" format for traceability
   */
  combinedResponses?: string;
}

/**
 * A semantic bucket within a cluster (LLM-generated)
 * Groups responses that express similar ideas
 */
export interface ClusterBucket {
  bucketId: string;
  clusterIndex: number;
  bucketName: string;
  consolidatedStatement: string;
  /** Original responses that were consolidated into this bucket */
  responses: Array<{
    id: string;
    responseText: string;
    tag: string | null;
  }>;
  responseCount: number;
}

/**
 * Complete view model for Understand page
 * Assembled server-side and passed to client component
 */
export interface UnderstandViewModel {
  conversationId: string;
  responses: ResponsePoint[];
  themes: ThemeRow[];
  feedbackItems: FeedbackItem[];
  frequentlyMentionedGroups?: FrequentlyMentionedGroup[];
  /** LLM-generated semantic buckets per cluster */
  clusterBuckets?: ClusterBucket[];
  /** Response IDs that couldn't be consolidated */
  unconsolidatedResponseIds?: string[];
  analysisStatus?: "not_started" | "embedding" | "analyzing" | "ready" | "error" | null;
  analysisError?: string | null;
  responseCount?: number;
  threshold?: number;
  analysisResponseCount?: number | null;
  analysisUpdatedAt?: string | null;
  newResponsesSinceAnalysis?: number;
  isAnalysisStale?: boolean;
}
