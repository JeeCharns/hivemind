/**
 * Feedback Domain Types
 *
 * Types specific to the feedback system
 * Follows SRP: types separate from logic
 */

import type { Feedback, FeedbackCounts } from "@/types/conversation-understand";

/**
 * Input for voting on a response
 */
export interface VoteFeedbackInput {
  responseId: string;
  feedback: Feedback;
}

/**
 * Response from API after voting
 */
export interface VoteFeedbackResult {
  success: boolean;
  counts?: FeedbackCounts;
  error?: string;
}
