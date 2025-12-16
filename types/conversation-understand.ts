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
  clusterIndex: number | null;
  xUmap: number | null;
  yUmap: number | null;
}

/**
 * Theme cluster row from analysis
 * Represents a grouped cluster of similar responses
 */
export interface ThemeRow {
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
  clusterIndex: number | null;
  counts: FeedbackCounts;
  current: Feedback | null;
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
}
