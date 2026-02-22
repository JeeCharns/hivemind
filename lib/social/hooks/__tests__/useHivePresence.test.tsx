/**
 * Tests for useHivePresence hook
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useHivePresence } from "../useHivePresence";

// Define mock channel type for presence handling
interface PresenceData {
  displayName: string;
  avatarUrl: string | null;
}

interface MockChannel {
  on: jest.Mock;
  subscribe: jest.Mock;
  track: jest.Mock;
  presenceState: jest.Mock;
  simulateSync: (state: Record<string, PresenceData[]>) => void;
  simulateError: () => void;
}

// Mock channel implementation
const createMockChannel = (): MockChannel => {
  let presenceHandler: ((payload: unknown) => void) | null = null;
  let subscribeCallback: ((status: string, err?: Error) => void) | null = null;
  let currentState: Record<string, PresenceData[]> = {};

  const channel: MockChannel = {
    on: jest.fn(
      (type: string, filter: unknown, handler: (payload: unknown) => void) => {
        if (
          type === "presence" &&
          typeof filter === "object" &&
          filter !== null &&
          "event" in filter &&
          (filter as { event: string }).event === "sync"
        ) {
          presenceHandler = handler;
        }
        return channel; // Return self for chaining
      }
    ),
    subscribe: jest.fn((callback: (status: string, err?: Error) => void) => {
      subscribeCallback = callback;
      // Simulate async subscription success
      setTimeout(() => callback("SUBSCRIBED"), 0);
      return channel;
    }),
    track: jest.fn().mockResolvedValue("ok"),
    presenceState: jest.fn(() => currentState),
    // Helper to simulate presence sync events
    simulateSync: (state: Record<string, PresenceData[]>) => {
      currentState = state;
      presenceHandler?.({});
    },
    // Helper to simulate connection error
    simulateError: () => {
      subscribeCallback?.("CHANNEL_ERROR", new Error("Connection failed"));
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

describe("useHivePresence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockChannel = createMockChannel();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return empty array initially", () => {
    const { result } = renderHook(() =>
      useHivePresence({ hiveId: "hive-123", userId: "user-456" })
    );

    expect(result.current.activeUsers).toEqual([]);
  });

  it("should subscribe to presence channel with correct name", async () => {
    renderHook(() =>
      useHivePresence({ hiveId: "hive-123", userId: "user-456" })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require("@/lib/supabase/client");
    expect(supabase.channel).toHaveBeenCalledWith("hive:hive-123:presence", {
      config: { presence: { key: "user-456" } },
    });
  });

  it("should track own presence after subscribing", async () => {
    renderHook(() =>
      useHivePresence({
        hiveId: "hive-123",
        userId: "user-456",
        displayName: "Test User",
        avatarUrl: "https://example.com/avatar.jpg",
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    await waitFor(() => {
      expect(mockChannel.track).toHaveBeenCalledWith({
        displayName: "Test User",
        avatarUrl: "https://example.com/avatar.jpg",
      });
    });
  });

  it("should transition to connected state on successful subscription", async () => {
    const { result } = renderHook(() =>
      useHivePresence({ hiveId: "hive-123", userId: "user-456" })
    );

    expect(result.current.status).toBe("disconnected");

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });
  });

  it("should update activeUsers when presence syncs", async () => {
    const { result } = renderHook(() =>
      useHivePresence({ hiveId: "hive-123", userId: "user-456" })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    // Simulate another user joining
    act(() => {
      mockChannel.simulateSync({
        "user-789": [{ displayName: "Other User", avatarUrl: null }],
      });
    });

    expect(result.current.activeUsers).toHaveLength(1);
    expect(result.current.activeUsers[0]).toMatchObject({
      userId: "user-789",
      displayName: "Other User",
      avatarUrl: null,
    });
  });

  it("should handle multiple users in presence state", async () => {
    const { result } = renderHook(() =>
      useHivePresence({ hiveId: "hive-123", userId: "user-456" })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    // Simulate multiple users
    act(() => {
      mockChannel.simulateSync({
        "user-1": [
          { displayName: "User One", avatarUrl: "https://example.com/1.jpg" },
        ],
        "user-2": [{ displayName: "User Two", avatarUrl: null }],
        "user-3": [
          { displayName: "User Three", avatarUrl: "https://example.com/3.jpg" },
        ],
      });
    });

    expect(result.current.activeUsers).toHaveLength(3);
  });

  it("should handle connection errors", async () => {
    // Override subscribe to simulate error
    mockChannel.subscribe = jest.fn(
      (callback: (status: string, err?: Error) => void) => {
        setTimeout(
          () => callback("CHANNEL_ERROR", new Error("Connection failed")),
          0
        );
        return mockChannel;
      }
    );

    const { result } = renderHook(() =>
      useHivePresence({ hiveId: "hive-123", userId: "user-456" })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
  });

  it("should use default displayName when not provided", async () => {
    renderHook(() =>
      useHivePresence({ hiveId: "hive-123", userId: "user-456" })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    await waitFor(() => {
      expect(mockChannel.track).toHaveBeenCalledWith({
        displayName: "Anonymous",
        avatarUrl: null,
      });
    });
  });

  it("should clean up channel on unmount", async () => {
    const { unmount } = renderHook(() =>
      useHivePresence({ hiveId: "hive-123", userId: "user-456" })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    unmount();

    expect(getMockRemoveChannel).toHaveBeenCalled();
  });

  it("should reconnect when hiveId changes", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require("@/lib/supabase/client");

    const { rerender } = renderHook(
      ({ hiveId }) => useHivePresence({ hiveId, userId: "user-456" }),
      { initialProps: { hiveId: "hive-123" } }
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    // Should have created channel for first hive
    expect(supabase.channel).toHaveBeenCalledWith(
      "hive:hive-123:presence",
      expect.any(Object)
    );

    // Change hive
    mockChannel = createMockChannel();
    rerender({ hiveId: "hive-456" });

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    // Should have removed old channel and created new one
    expect(getMockRemoveChannel).toHaveBeenCalled();
    expect(supabase.channel).toHaveBeenCalledWith(
      "hive:hive-456:presence",
      expect.any(Object)
    );
  });
});
