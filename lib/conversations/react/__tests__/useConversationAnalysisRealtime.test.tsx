/**
 * Unit tests for useConversationAnalysisRealtime hook
 *
 * Tests subscription lifecycle, debouncing, and fallback behavior
 */

import { renderHook, waitFor } from "@testing-library/react";
import { useConversationAnalysisRealtime } from "../useConversationAnalysisRealtime";
import { supabase } from "@/lib/supabase/client";

// Mock Supabase client
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

describe("useConversationAnalysisRealtime", () => {
  let mockChannel: any;
  let mockOn: jest.Mock;
  let mockSubscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockOn = jest.fn().mockReturnThis();
    mockSubscribe = jest.fn().mockImplementation((callback) => {
      // Simulate successful subscription
      setTimeout(() => callback("SUBSCRIBED"), 0);
      return mockChannel;
    });

    mockChannel = {
      on: mockOn,
      subscribe: mockSubscribe,
    };

    (supabase.channel as jest.Mock).mockReturnValue(mockChannel);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("should not subscribe when disabled", () => {
    const onRefresh = jest.fn();

    renderHook(() =>
      useConversationAnalysisRealtime({
        conversationId: "conv-1",
        enabled: false,
        onRefresh,
      })
    );

    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it("should subscribe to conversations and themes when enabled", () => {
    const onRefresh = jest.fn();

    renderHook(() =>
      useConversationAnalysisRealtime({
        conversationId: "conv-1",
        enabled: true,
        onRefresh,
      })
    );

    expect(supabase.channel).toHaveBeenCalledWith("analysis:conv-1");
    expect(mockOn).toHaveBeenCalledTimes(2); // conversations + themes

    // Check conversations subscription
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "UPDATE",
        table: "conversations",
        filter: "id=eq.conv-1",
      }),
      expect.any(Function)
    );

    // Check themes subscription
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "*",
        table: "conversation_themes",
        filter: "conversation_id=eq.conv-1",
      }),
      expect.any(Function)
    );

    expect(mockSubscribe).toHaveBeenCalled();
  });

  it("should call onRefresh when conversations update event fires", async () => {
    const onRefresh = jest.fn();
    let conversationsHandler: Function;

    mockOn.mockImplementation((type, config, handler) => {
      if (config.table === "conversations") {
        conversationsHandler = handler;
      }
      return mockChannel;
    });

    renderHook(() =>
      useConversationAnalysisRealtime({
        conversationId: "conv-1",
        enabled: true,
        onRefresh,
        debounceMs: 100,
      })
    );

    // Simulate conversations update event
    conversationsHandler!({ new: { analysis_status: "ready" } });

    // Wait for debounce
    jest.advanceTimersByTime(100);

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("should debounce multiple rapid events", async () => {
    const onRefresh = jest.fn();
    let conversationsHandler: Function;
    let themesHandler: Function;

    mockOn.mockImplementation((type, config, handler) => {
      if (config.table === "conversations") {
        conversationsHandler = handler;
      } else if (config.table === "conversation_themes") {
        themesHandler = handler;
      }
      return mockChannel;
    });

    renderHook(() =>
      useConversationAnalysisRealtime({
        conversationId: "conv-1",
        enabled: true,
        onRefresh,
        debounceMs: 500,
      })
    );

    // Simulate rapid events
    conversationsHandler!({ new: { analysis_status: "analyzing" } });
    themesHandler!({ new: { cluster_index: 0 } });
    themesHandler!({ new: { cluster_index: 1 } });
    conversationsHandler!({ new: { analysis_status: "ready" } });

    // Advance time partway
    jest.advanceTimersByTime(400);
    expect(onRefresh).not.toHaveBeenCalled();

    // Advance past debounce
    jest.advanceTimersByTime(100);

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1); // Only called once despite 4 events
    });
  });

  it("should unsubscribe on unmount", () => {
    const onRefresh = jest.fn();

    const { unmount } = renderHook(() =>
      useConversationAnalysisRealtime({
        conversationId: "conv-1",
        enabled: true,
        onRefresh,
      })
    );

    unmount();

    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it("should handle subscription errors", async () => {
    mockSubscribe.mockImplementation((callback) => {
      setTimeout(() => callback("CHANNEL_ERROR"), 0);
      return mockChannel;
    });

    const onRefresh = jest.fn();

    const { result } = renderHook(() =>
      useConversationAnalysisRealtime({
        conversationId: "conv-1",
        enabled: true,
        onRefresh,
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("Realtime connection channel_error");
    });
  });

  it("should update status to connected on successful subscription", async () => {
    const onRefresh = jest.fn();

    const { result } = renderHook(() =>
      useConversationAnalysisRealtime({
        conversationId: "conv-1",
        enabled: true,
        onRefresh,
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
      expect(result.current.error).toBeUndefined();
    });
  });

  it("should resubscribe when conversationId changes", () => {
    const onRefresh = jest.fn();

    const { rerender } = renderHook(
      ({ conversationId }) =>
        useConversationAnalysisRealtime({
          conversationId,
          enabled: true,
          onRefresh,
        }),
      { initialProps: { conversationId: "conv-1" } }
    );

    expect(supabase.channel).toHaveBeenCalledWith("analysis:conv-1");
    expect(supabase.channel).toHaveBeenCalledTimes(1);

    // Change conversationId
    rerender({ conversationId: "conv-2" });

    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
    expect(supabase.channel).toHaveBeenCalledWith("analysis:conv-2");
    expect(supabase.channel).toHaveBeenCalledTimes(2);
  });
});
