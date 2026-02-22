/**
 * Guest Feedback Client
 *
 * Implements IConversationFeedbackClient for guest users.
 * Posts feedback to the guest API endpoint instead of the authenticated one.
 *
 * Usage:
 *   const client = new GuestFeedbackClient(token);
 *   // Pass to UnderstandView or useConversationFeedback
 */

import type { Feedback, FeedbackCounts } from "@/types/conversation-understand";
import type { IConversationFeedbackClient } from "@/lib/conversations/data/feedbackClient";
import type { VoteFeedbackResult } from "@/lib/conversations/domain/feedback.types";

export class GuestFeedbackClient implements IConversationFeedbackClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Submit a feedback vote via the guest API.
   * Note: `conversationId` is ignored — the guest token already identifies the conversation.
   */
  async vote(
    _conversationId: string,
    responseId: string,
    feedback: Feedback
  ): Promise<VoteFeedbackResult> {
    try {
      const res = await fetch(`/api/guest/${this.token}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ responseId: String(responseId), feedback }),
      });

      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to submit feedback" }));
        return {
          success: false,
          error: error.error || "Failed to submit feedback",
        };
      }

      const data = await res.json();
      return {
        success: true,
        counts: data.counts as FeedbackCounts,
      };
    } catch {
      return {
        success: false,
        error: "Network error submitting feedback",
      };
    }
  }
}
