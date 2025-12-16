/**
 * Feedback Client - Data Access Layer
 *
 * Client for submitting feedback votes on responses
 * Follows DIP: interface allows for mocking in tests
 */

import type { Feedback, FeedbackCounts } from "@/types/conversation-understand";
import type { VoteFeedbackResult } from "../domain/feedback.types";

/**
 * Interface for conversation feedback client
 * Allows for dependency injection and testing
 */
export interface IConversationFeedbackClient {
  vote(
    conversationId: string,
    responseId: string,
    feedback: Feedback
  ): Promise<VoteFeedbackResult>;
}

/**
 * Default implementation using fetch API
 */
export class ConversationFeedbackClient implements IConversationFeedbackClient {
  async vote(
    conversationId: string,
    responseId: string,
    feedback: Feedback
  ): Promise<VoteFeedbackResult> {
    const response = await fetch(`/api/conversations/${conversationId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseId, feedback }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to submit feedback" }));
      return {
        success: false,
        error: error.error || "Failed to submit feedback",
      };
    }

    const data = await response.json();
    return {
      success: true,
      counts: data.counts as FeedbackCounts,
    };
  }
}

/**
 * Default client instance
 */
export const feedbackClient = new ConversationFeedbackClient();
