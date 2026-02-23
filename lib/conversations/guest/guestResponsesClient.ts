/**
 * Guest Responses Client - Data Access Layer
 *
 * Implements IConversationResponsesClient for guest users,
 * hitting /api/guest/[token]/responses instead of authenticated endpoints.
 * Follows DIP: same interface as the authenticated client.
 */

import type { LiveResponse, SubmitResponseInput } from "../domain/listen.types";
import type { IConversationResponsesClient } from "../data/responsesClient";

/**
 * Guest implementation of the responses client.
 * Routes requests through the guest API using the share token.
 *
 * Note: The `conversationId` parameter in list/create is ignored —
 * the token implicitly identifies the conversation on the server.
 */
export class GuestResponsesClient implements IConversationResponsesClient {
  constructor(private readonly token: string) {}

  async list(_conversationId: string): Promise<LiveResponse[]> {
    const res = await fetch(`/api/guest/${this.token}/responses`, {
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "Failed to fetch responses");
    }
    const data = await res.json();
    return data.responses || [];
  }

  async create(
    _conversationId: string,
    input: SubmitResponseInput
  ): Promise<LiveResponse> {
    const res = await fetch(`/api/guest/${this.token}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text: input.text, tag: input.tag }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "Failed to submit response");
    }
    const data = await res.json();
    return data.response;
  }
}
