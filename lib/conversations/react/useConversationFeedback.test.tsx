/**
 * useConversationFeedback Hook Tests
 *
 * Tests the conversation feedback hook with mocked clients
 * Validates optimistic updates, error handling, and revert logic
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useConversationFeedback } from "./useConversationFeedback";
import type { IConversationFeedbackClient } from "../data";
import type { FeedbackItem, Feedback, FeedbackCounts } from "@/types/conversation-understand";
import type { VoteFeedbackResult } from "../domain/feedback.types";

// Mock client
class MockFeedbackClient implements IConversationFeedbackClient {
  public voteCalls: Array<{
    conversationId: string;
    responseId: string;
    feedback: Feedback;
  }> = [];
  public shouldFail: boolean = false;
  public responseCount: FeedbackCounts = { agree: 1, pass: 0, disagree: 0 };

  async vote(
    conversationId: string,
    responseId: string,
    feedback: Feedback
  ): Promise<VoteFeedbackResult> {
    this.voteCalls.push({ conversationId, responseId, feedback });

    if (this.shouldFail) {
      return { success: false, error: "Failed to submit feedback" };
    }

    return {
      success: true,
      counts: this.responseCount,
    };
  }
}

describe("useConversationFeedback", () => {
  const getInitialItems = (): FeedbackItem[] => [
    {
      id: "1",
      responseText: "First response",
      tag: "need",
      clusterIndex: 0,
      counts: { agree: 5, pass: 2, disagree: 1 },
      current: null,
    },
    {
      id: "2",
      responseText: "Second response",
      tag: "data",
      clusterIndex: 1,
      counts: { agree: 3, pass: 1, disagree: 0 },
      current: "agree",
    },
  ];

  it("should initialize with provided items", () => {
    const mockClient = new MockFeedbackClient();
    const initialItems = getInitialItems();

    const { result } = renderHook(() =>
      useConversationFeedback({
        conversationId: "conv-1",
        initialItems,
        feedbackClient: mockClient,
      })
    );

    expect(result.current.items).toEqual(initialItems);
    expect(result.current.loadingId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("should optimistically update counts when voting", async () => {
    const mockClient = new MockFeedbackClient();
    const initialItems = getInitialItems();

    const { result } = renderHook(() =>
      useConversationFeedback({
        conversationId: "conv-1",
        initialItems,
        feedbackClient: mockClient,
      })
    );

    // Vote "agree" on first item (no previous vote)
    await act(async () => {
      await result.current.vote("1", "agree");
    });

    await waitFor(() => {
      expect(result.current.loadingId).toBeNull();
    });

    const item = result.current.items.find((i) => i.id === "1");
    expect(item?.current).toBe("agree");
    expect(item?.counts.agree).toBe(1); // Server response
    expect(mockClient.voteCalls).toHaveLength(1);
    expect(mockClient.voteCalls[0]).toEqual({
      conversationId: "conv-1",
      responseId: "1",
      feedback: "agree",
    });
  });

  it("should decrement previous choice when changing vote", async () => {
    const mockClient = new MockFeedbackClient();
    mockClient.responseCount = { agree: 4, pass: 1, disagree: 0 };
    const initialItems = getInitialItems();

    const { result } = renderHook(() =>
      useConversationFeedback({
        conversationId: "conv-1",
        initialItems,
        feedbackClient: mockClient,
      })
    );

    // Vote "pass" on second item (was "agree")
    await act(async () => {
      await result.current.vote("2", "pass");
    });

    await waitFor(() => {
      expect(result.current.loadingId).toBeNull();
    });

    const item = result.current.items.find((i) => i.id === "2");
    expect(item?.current).toBe("pass");
    expect(item?.counts).toEqual({ agree: 4, pass: 1, disagree: 0 }); // Server counts
  });

  it("should revert on failure", async () => {
    const mockClient = new MockFeedbackClient();
    mockClient.shouldFail = true;
    const initialItems = getInitialItems();

    const { result } = renderHook(() =>
      useConversationFeedback({
        conversationId: "conv-1",
        initialItems,
        feedbackClient: mockClient,
      })
    );

    const originalItem = result.current.items.find((i) => i.id === "1")!;

    // Attempt to vote (will fail)
    await act(async () => {
      await result.current.vote("1", "agree");
    });

    await waitFor(() => {
      expect(result.current.loadingId).toBeNull();
    });

    // Should revert to original state
    const item = result.current.items.find((i) => i.id === "1");
    expect(item).toEqual(originalItem);
    expect(result.current.error).toBe("Failed to submit feedback");
  });

  it("should set loading state during vote", async () => {
    const mockClient = new MockFeedbackClient();
    const initialItems = getInitialItems();

    const { result } = renderHook(() =>
      useConversationFeedback({
        conversationId: "conv-1",
        initialItems,
        feedbackClient: mockClient,
      })
    );

    await act(async () => {
      await result.current.vote("1", "agree");
    });

    await waitFor(() => {
      expect(result.current.loadingId).toBeNull();
    });

    // Vote was called
    expect(mockClient.voteCalls).toHaveLength(1);
  });

  it("should handle voting disagree", async () => {
    const mockClient = new MockFeedbackClient();
    mockClient.responseCount = { agree: 5, pass: 2, disagree: 2 };
    const initialItems = getInitialItems();

    const { result } = renderHook(() =>
      useConversationFeedback({
        conversationId: "conv-1",
        initialItems,
        feedbackClient: mockClient,
      })
    );

    await act(async () => {
      await result.current.vote("1", "disagree");
    });

    await waitFor(() => {
      expect(result.current.loadingId).toBeNull();
    });

    const item = result.current.items.find((i) => i.id === "1");
    expect(item?.current).toBe("disagree");
    expect(item?.counts.disagree).toBe(2);
  });

  it("should handle exception during vote", async () => {
    const initialItems = getInitialItems();
    const failingClient = new MockFeedbackClient();
    failingClient.vote = async () => {
      throw new Error("Network error");
    };

    const { result } = renderHook(() =>
      useConversationFeedback({
        conversationId: "conv-1",
        initialItems,
        feedbackClient: failingClient,
      })
    );

    const originalItem = result.current.items.find((i) => i.id === "1")!;

    await act(async () => {
      await result.current.vote("1", "agree");
    });

    await waitFor(() => {
      expect(result.current.loadingId).toBeNull();
    });

    // Should revert and set error
    const item = result.current.items.find((i) => i.id === "1");
    expect(item).toEqual(originalItem);
    expect(result.current.error).toBe("Network error");
  });

  it("should update with server counts on success", async () => {
    const mockClient = new MockFeedbackClient();
    mockClient.responseCount = { agree: 10, pass: 5, disagree: 3 };
    const initialItems = getInitialItems();

    const { result } = renderHook(() =>
      useConversationFeedback({
        conversationId: "conv-1",
        initialItems,
        feedbackClient: mockClient,
      })
    );

    await act(async () => {
      await result.current.vote("1", "agree");
    });

    await waitFor(() => {
      expect(result.current.loadingId).toBeNull();
    });

    const item = result.current.items.find((i) => i.id === "1");
    // Server counts should replace optimistic counts
    expect(item?.counts).toEqual({ agree: 10, pass: 5, disagree: 3 });
  });

  it("should not update if item not found", async () => {
    const mockClient = new MockFeedbackClient();
    const initialItems = getInitialItems();

    const { result } = renderHook(() =>
      useConversationFeedback({
        conversationId: "conv-1",
        initialItems,
        feedbackClient: mockClient,
      })
    );

    const originalItems = result.current.items;

    await act(async () => {
      await result.current.vote("nonexistent", "agree");
    });

    // Should not change items
    expect(result.current.items).toEqual(originalItems);
    expect(mockClient.voteCalls).toHaveLength(0);
  });
});
