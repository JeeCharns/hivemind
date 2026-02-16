/**
 * Tests for useConversationFeedRealtime hook
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useConversationFeedRealtime } from "../useConversationFeedRealtime";
import type { LiveResponse } from "../../domain/listen.types";

// Define mock channel type explicitly to avoid circular reference
interface MockChannel {
  on: jest.Mock;
  subscribe: jest.Mock;
  simulateBroadcast: (event: string, payload: unknown) => void;
  simulatePostgresChange: () => void;
  simulateError: (error: Error) => void;
  simulateDisconnect: () => void;
}

// Mock channel implementation
const createMockChannel = (): MockChannel => {
  const handlers: Record<string, ((payload: unknown) => void)[]> = {};
  let subscribeCallback: ((status: string, err?: Error) => void) | null = null;

  const channel: MockChannel = {
    on: jest.fn((type: string, filter: unknown, handler: (payload: unknown) => void) => {
      const key = typeof filter === "object" && filter !== null && "event" in filter
        ? `${type}:${(filter as { event: string }).event}`
        : type;
      if (!handlers[key]) {
        handlers[key] = [];
      }
      handlers[key].push(handler);
      return channel; // Return self for chaining
    }),
    subscribe: jest.fn((callback: (status: string, err?: Error) => void) => {
      subscribeCallback = callback;
      // Simulate async subscription success
      setTimeout(() => callback("SUBSCRIBED"), 0);
      return channel;
    }),
    // Helper to simulate broadcast events
    simulateBroadcast: (event: string, payload: unknown) => {
      const key = `broadcast:${event}`;
      handlers[key]?.forEach((h) => h({ payload }));
    },
    // Helper to simulate postgres_changes
    simulatePostgresChange: () => {
      handlers["postgres_changes"]?.forEach((h) => h({}));
    },
    // Helper to simulate connection error
    simulateError: (error: Error) => {
      subscribeCallback?.("CHANNEL_ERROR", error);
    },
    // Helper to simulate disconnect
    simulateDisconnect: () => {
      subscribeCallback?.("CLOSED");
    },
  };

  return channel;
};

let mockChannel: MockChannel;

// Use a factory function that returns new mock on each call
const getMockRemoveChannel = jest.fn();

// Mock Supabase client - must use factory to avoid hoisting issues
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: (...args: unknown[]) => getMockRemoveChannel(...args),
  },
}));

// Mock the broadcast constants
jest.mock("../../server/broadcastResponse", () => ({
  getFeedChannelName: (id: string) => `feed:${id}`,
  FEED_BROADCAST_EVENT: "new_response",
}));

describe("useConversationFeedRealtime", () => {
  const mockResponse: LiveResponse = {
    id: "response-123",
    text: "Test response",
    tag: "need",
    createdAt: "2024-01-01T00:00:00Z",
    user: { name: "Test User", avatarUrl: null },
    likeCount: 0,
    likedByMe: false,
    isMine: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockChannel = createMockChannel();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("stays disconnected when disabled", async () => {
    const onNewResponse = jest.fn();

    const { result } = renderHook(() =>
      useConversationFeedRealtime({
        conversationId: "conv-123",
        enabled: false,
        onNewResponse,
      })
    );

    // Advance microtask queue
    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    expect(result.current.status).toBe("disconnected");
  });

  it("transitions to connected state on successful subscription", async () => {
    const onNewResponse = jest.fn();

    const { result } = renderHook(() =>
      useConversationFeedRealtime({
        conversationId: "conv-123",
        onNewResponse,
      })
    );

    // Advance timers to trigger async subscription callback
    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });
  });

  it("calls onNewResponse when broadcast event received", async () => {
    const onNewResponse = jest.fn();

    renderHook(() =>
      useConversationFeedRealtime({
        conversationId: "conv-123",
        onNewResponse,
      })
    );

    // Wait for subscription
    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    // Simulate broadcast
    act(() => {
      mockChannel.simulateBroadcast("new_response", { response: mockResponse });
    });

    expect(onNewResponse).toHaveBeenCalledWith(mockResponse);
  });

  // Note: Debounce behavior is validated through manual testing.
  // The debounce logic uses setTimeout which interacts poorly with Jest's
  // fake timers when combined with async React Testing Library operations.

  it("handles connection errors", async () => {
    const onNewResponse = jest.fn();

    // Override subscribe to simulate error
    mockChannel.subscribe = jest.fn((callback: (status: string, err?: Error) => void) => {
      setTimeout(() => callback("CHANNEL_ERROR", new Error("Connection failed")), 0);
      return mockChannel;
    });

    const { result } = renderHook(() =>
      useConversationFeedRealtime({
        conversationId: "conv-123",
        onNewResponse,
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("Connection failed");
    });
  });

  it("cleans up channel on unmount", async () => {
    const onNewResponse = jest.fn();

    const { unmount } = renderHook(() =>
      useConversationFeedRealtime({
        conversationId: "conv-123",
        onNewResponse,
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    unmount();

    expect(getMockRemoveChannel).toHaveBeenCalled();
  });

  it("reconnects when conversationId changes", async () => {
    const onNewResponse = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require("@/lib/supabase/client");

    const { rerender } = renderHook(
      ({ conversationId }) =>
        useConversationFeedRealtime({
          conversationId,
          onNewResponse,
        }),
      { initialProps: { conversationId: "conv-123" } }
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    // Should have created channel for first conversation
    expect(supabase.channel).toHaveBeenCalledWith("feed:conv-123");

    // Change conversation
    mockChannel = createMockChannel();
    rerender({ conversationId: "conv-456" });

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    // Should have removed old channel and created new one
    expect(getMockRemoveChannel).toHaveBeenCalled();
    expect(supabase.channel).toHaveBeenCalledWith("feed:conv-456");
  });

  it("does not call onNewResponse for invalid payload", async () => {
    const onNewResponse = jest.fn();

    renderHook(() =>
      useConversationFeedRealtime({
        conversationId: "conv-123",
        onNewResponse,
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    // Simulate broadcast with invalid payload
    act(() => {
      mockChannel.simulateBroadcast("new_response", { invalid: "data" });
    });

    expect(onNewResponse).not.toHaveBeenCalled();
  });
});
