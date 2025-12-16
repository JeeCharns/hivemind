/**
 * Conversation API Client
 *
 * Client-side wrapper for conversation API endpoints
 * Follows SRP: API communication logic separate from UI
 * Provides strong typing and error handling
 */

import type {
  CreateConversationRequest,
  CreateConversationResponse,
  TriggerConversationAnalysisResponse,
  UploadConversationCsvResponse,
} from "@/types/conversations-api";

/**
 * API Error class for typed error handling
 */
export class ConversationApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number
  ) {
    super(message);
    this.name = "ConversationApiError";
  }
}

/**
 * Create a new conversation
 *
 * @param input - Conversation creation parameters
 * @returns Created conversation ID
 * @throws ConversationApiError on failure
 */
export async function createConversation(
  input: CreateConversationRequest
): Promise<CreateConversationResponse> {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ConversationApiError(
      body?.error ?? "Failed to create conversation",
      body?.code,
      response.status
    );
  }

  return response.json();
}

/**
 * Upload a CSV file to import responses
 *
 * @param conversationId - Target conversation ID
 * @param file - CSV file to upload
 * @returns Number of imported responses
 * @throws ConversationApiError on failure
 */
export async function uploadConversationCsv(
  conversationId: string,
  file: File
): Promise<UploadConversationCsvResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `/api/conversations/${conversationId}/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ConversationApiError(
      body?.error ?? "Failed to upload CSV",
      body?.code,
      response.status
    );
  }

  return response.json();
}

/**
 * Start conversation analysis (fire-and-forget style)
 *
 * @param conversationId - Conversation to analyze
 * @returns Analysis job status
 * @throws ConversationApiError on failure
 */
export async function startConversationAnalysis(
  conversationId: string
): Promise<TriggerConversationAnalysisResponse> {
  const response = await fetch(
    `/api/conversations/${conversationId}/analyze`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ConversationApiError(
      body?.error ?? "Failed to start analysis",
      body?.code,
      response.status
    );
  }

  return response.json();
}
