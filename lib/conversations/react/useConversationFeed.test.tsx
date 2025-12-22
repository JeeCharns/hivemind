/**
 * useConversationFeed Hook Tests
 *
 * Tests the conversation feed hook with mocked clients
 * Validates optimistic updates, error handling, and state management
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useConversationFeed } from "./useConversationFeed";
import type {
  IConversationResponsesClient,
  IResponseLikesClient,
} from "../data";
import type {
  LiveResponse,
  SubmitResponseInput,
  LikeToggleResult,
} from "../domain/listen.types";

// Mock clients
class MockResponsesClient implements IConversationResponsesClient {
  private responses: LiveResponse[] = [];
  public listCalls: string[] = [];
  public createCalls: Array<{ conversationId: string; input: SubmitResponseInput }> = [];

  setResponses(responses: LiveResponse[]) {
    this.responses = responses;
  }

  async list(conversationId: string): Promise<LiveResponse[]> {
    this.listCalls.push(conversationId);
    return [...this.responses];
  }

  async create(
    conversationId: string,
    input: SubmitResponseInput
  ): Promise<LiveResponse> {
    this.createCalls.push({ conversationId, input });
    const newResponse: LiveResponse = {
      id: `response-${Date.now()}`,
      text: input.text,
      tag: input.tag,
      createdAt: new Date().toISOString(),
      user: { name: input.anonymous ? "Anonymous" : "Test User", avatarUrl: null },
      likeCount: 0,
      likedByMe: false,
    };
    this.responses.unshift(newResponse);
    return newResponse;
  }
}

class MockLikesClient implements IResponseLikesClient {
  public likeCalls: string[] = [];
  public unlikeCalls: string[] = [];
  public shouldFail: boolean = false;

  async like(responseId: string): Promise<LikeToggleResult> {
    this.likeCalls.push(responseId);
    if (this.shouldFail) {
      return { success: false, error: "Failed to like" };
    }
    return { success: true, liked: true, likeCount: 1 };
  }

  async unlike(responseId: string): Promise<LikeToggleResult> {
    this.unlikeCalls.push(responseId);
    if (this.shouldFail) {
      return { success: false, error: "Failed to unlike" };
    }
    return { success: true, liked: false, likeCount: 0 };
  }
}

describe("useConversationFeed", () => {
  let mockResponsesClient: MockResponsesClient;
  let mockLikesClient: MockLikesClient;

  beforeEach(() => {
    mockResponsesClient = new MockResponsesClient();
    mockLikesClient = new MockLikesClient();
  });

  it("should load feed on mount", async () => {
    const mockResponses: LiveResponse[] = [
      {
        id: "1",
        text: "First response",
        tag: "need",
        createdAt: "2025-01-01T00:00:00Z",
        user: { name: "User 1", avatarUrl: null },
        likeCount: 5,
        likedByMe: false,
      },
      {
        id: "2",
        text: "Second response",
        tag: "data",
        createdAt: "2025-01-02T00:00:00Z",
        user: { name: "User 2", avatarUrl: null },
        likeCount: 3,
        likedByMe: true,
      },
    ];

    mockResponsesClient.setResponses(mockResponses);

    const { result } = renderHook(() =>
      useConversationFeed({
        conversationId: "conv-1",
        responsesClient: mockResponsesClient,
        likesClient: mockLikesClient,
      })
    );

    expect(result.current.isLoadingFeed).toBe(true);
    expect(result.current.feed).toEqual([]);

    await waitFor(() => {
      expect(result.current.isLoadingFeed).toBe(false);
    });

    expect(result.current.feed).toEqual(mockResponses);
    expect(mockResponsesClient.listCalls).toEqual(["conv-1"]);
  });

  it("should submit a response and prepend to feed", async () => {
    mockResponsesClient.setResponses([]);

    const { result } = renderHook(() =>
      useConversationFeed({
        conversationId: "conv-1",
        responsesClient: mockResponsesClient,
        likesClient: mockLikesClient,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingFeed).toBe(false);
    });

    const input: SubmitResponseInput = {
      text: "New response",
      tag: "problem",
      anonymous: false,
    };

    await act(async () => {
      await result.current.submit(input);
    });

    expect(result.current.feed.length).toBe(1);
    expect(result.current.feed[0].text).toBe("New response");
    expect(result.current.feed[0].tag).toBe("problem");
    expect(mockResponsesClient.createCalls).toHaveLength(1);
    expect(mockResponsesClient.createCalls[0].input).toEqual(input);
  });

  it("should toggle like with optimistic update", async () => {
    const mockResponses: LiveResponse[] = [
      {
        id: "1",
        text: "First response",
        tag: "need",
        createdAt: "2025-01-01T00:00:00Z",
        user: { name: "User 1", avatarUrl: null },
        likeCount: 5,
        likedByMe: false,
      },
    ];

    mockResponsesClient.setResponses(mockResponses);

    const { result } = renderHook(() =>
      useConversationFeed({
        conversationId: "conv-1",
        responsesClient: mockResponsesClient,
        likesClient: mockLikesClient,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingFeed).toBe(false);
    });

    expect(result.current.feed[0].likedByMe).toBe(false);
    expect(result.current.feed[0].likeCount).toBe(5);

    // Toggle like (optimistically add like)
    await act(async () => {
      await result.current.toggleLike("1");
    });

    expect(result.current.feed[0].likedByMe).toBe(true);
    expect(result.current.feed[0].likeCount).toBe(6);
    expect(mockLikesClient.likeCalls).toEqual(["1"]);
  });

  it("should toggle unlike with optimistic update", async () => {
    const mockResponses: LiveResponse[] = [
      {
        id: "1",
        text: "First response",
        tag: "need",
        createdAt: "2025-01-01T00:00:00Z",
        user: { name: "User 1", avatarUrl: null },
        likeCount: 5,
        likedByMe: true,
      },
    ];

    mockResponsesClient.setResponses(mockResponses);

    const { result } = renderHook(() =>
      useConversationFeed({
        conversationId: "conv-1",
        responsesClient: mockResponsesClient,
        likesClient: mockLikesClient,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingFeed).toBe(false);
    });

    expect(result.current.feed[0].likedByMe).toBe(true);
    expect(result.current.feed[0].likeCount).toBe(5);

    // Toggle unlike (optimistically remove like)
    await act(async () => {
      await result.current.toggleLike("1");
    });

    expect(result.current.feed[0].likedByMe).toBe(false);
    expect(result.current.feed[0].likeCount).toBe(4);
    expect(mockLikesClient.unlikeCalls).toEqual(["1"]);
  });

  it("should revert optimistic update on like failure", async () => {
    const mockResponses: LiveResponse[] = [
      {
        id: "1",
        text: "First response",
        tag: "need",
        createdAt: "2025-01-01T00:00:00Z",
        user: { name: "User 1", avatarUrl: null },
        likeCount: 5,
        likedByMe: false,
      },
    ];

    mockResponsesClient.setResponses(mockResponses);
    mockLikesClient.shouldFail = true;

    const { result } = renderHook(() =>
      useConversationFeed({
        conversationId: "conv-1",
        responsesClient: mockResponsesClient,
        likesClient: mockLikesClient,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingFeed).toBe(false);
    });

    const originalLikeCount = result.current.feed[0].likeCount;
    const originalLikedByMe = result.current.feed[0].likedByMe;

    // Toggle like (should fail and revert)
    await act(async () => {
      await result.current.toggleLike("1");
    });

    // Should revert to original state
    expect(result.current.feed[0].likedByMe).toBe(originalLikedByMe);
    expect(result.current.feed[0].likeCount).toBe(originalLikeCount);
  });

  it("should handle submit errors", async () => {
    mockResponsesClient.setResponses([]);

    // Make create throw an error
    const failingClient = new MockResponsesClient();
    failingClient.create = async () => {
      throw new Error("Submit failed");
    };

    const { result } = renderHook(() =>
      useConversationFeed({
        conversationId: "conv-1",
        responsesClient: failingClient,
        likesClient: mockLikesClient,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingFeed).toBe(false);
    });

    const input: SubmitResponseInput = {
      text: "New response",
      tag: "problem",
      anonymous: false,
    };

    await act(async () => {
      try {
        await result.current.submit(input);
      } catch {
        // Error is re-thrown by the hook
      }
    });

    expect(result.current.error).toBe("Submit failed");
    expect(result.current.feed.length).toBe(0);
  });

  it("should refresh feed", async () => {
    const mockResponses: LiveResponse[] = [
      {
        id: "1",
        text: "First response",
        tag: "need",
        createdAt: "2025-01-01T00:00:00Z",
        user: { name: "User 1", avatarUrl: null },
        likeCount: 5,
        likedByMe: false,
      },
    ];

    mockResponsesClient.setResponses(mockResponses);

    const { result } = renderHook(() =>
      useConversationFeed({
        conversationId: "conv-1",
        responsesClient: mockResponsesClient,
        likesClient: mockLikesClient,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingFeed).toBe(false);
    });

    expect(mockResponsesClient.listCalls).toHaveLength(1);

    // Add another response to mock
    mockResponses.push({
      id: "2",
      text: "Second response",
      tag: "data",
      createdAt: "2025-01-02T00:00:00Z",
      user: { name: "User 2", avatarUrl: null },
      likeCount: 0,
      likedByMe: false,
    });

    // Refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.feed.length).toBe(2);
    expect(mockResponsesClient.listCalls).toHaveLength(2);
  });
});
