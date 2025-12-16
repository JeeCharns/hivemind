/**
 * Responses Client - Data Access Layer
 *
 * Client for fetching and creating conversation responses
 * Follows DIP: interface allows for mocking in tests
 */

import type { LiveResponse, SubmitResponseInput } from "../domain/listen.types";

/**
 * Interface for conversation responses client
 * Allows for dependency injection and testing
 */
export interface IConversationResponsesClient {
  list(conversationId: string): Promise<LiveResponse[]>;
  create(conversationId: string, input: SubmitResponseInput): Promise<LiveResponse>;
}

/**
 * Default implementation using fetch API
 */
export class ConversationResponsesClient implements IConversationResponsesClient {
  async list(conversationId: string): Promise<LiveResponse[]> {
    const response = await fetch(`/api/conversations/${conversationId}/responses`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to fetch responses" }));
      throw new Error(error.error || "Failed to fetch responses");
    }

    const data = await response.json();
    return data.responses || [];
  }

  async create(conversationId: string, input: SubmitResponseInput): Promise<LiveResponse> {
    const response = await fetch(`/api/conversations/${conversationId}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to create response" }));
      throw new Error(error.error || "Failed to create response");
    }

    const data = await response.json();
    return data.response;
  }
}

/**
 * Default client instance
 */
export const responsesClient = new ConversationResponsesClient();
