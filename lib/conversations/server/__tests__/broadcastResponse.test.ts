/**
 * Tests for broadcastResponse service
 */

import {
  broadcastResponse,
  getFeedChannelName,
  FEED_BROADCAST_EVENT,
} from "../broadcastResponse";
import type { LiveResponse } from "../../domain/listen.types";

// Mock Supabase client
const mockSend = jest.fn();
const mockSubscribe = jest.fn((callback: (status: string) => void) => {
  // Simulate successful subscription
  callback("SUBSCRIBED");
  return Promise.resolve();
});
const mockRemoveChannel = jest.fn().mockResolvedValue(undefined);
const mockChannel = jest.fn(() => ({
  subscribe: mockSubscribe,
  send: mockSend,
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  })),
}));

describe("broadcastResponse", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SECRET_KEY: "test-secret-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const mockResponse: LiveResponse = {
    id: "response-123",
    text: "Test response",
    tag: "need",
    createdAt: "2024-01-01T00:00:00Z",
    user: {
      name: "Test User",
      avatarUrl: null,
    },
    likeCount: 0,
    likedByMe: false,
    isMine: false,
  };

  it("broadcasts response to correct channel", async () => {
    await broadcastResponse({
      conversationId: "conv-456",
      response: mockResponse,
    });

    expect(mockChannel).toHaveBeenCalledWith("feed:conv-456");
    expect(mockSubscribe).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith({
      type: "broadcast",
      event: FEED_BROADCAST_EVENT,
      payload: { response: mockResponse },
    });
  });

  it("cleans up channel after broadcast", async () => {
    await broadcastResponse({
      conversationId: "conv-456",
      response: mockResponse,
    });

    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it("does not throw on missing environment variables", async () => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;

    // Should not throw
    await expect(
      broadcastResponse({
        conversationId: "conv-456",
        response: mockResponse,
      })
    ).resolves.toBeUndefined();
  });

  it("does not throw on broadcast error", async () => {
    mockSubscribe.mockImplementationOnce(() => {
      throw new Error("Broadcast failed");
    });

    // Should not throw
    await expect(
      broadcastResponse({
        conversationId: "conv-456",
        response: mockResponse,
      })
    ).resolves.toBeUndefined();
  });

  it("uses SUPABASE_SERVICE_ROLE_KEY as fallback", async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    };
    delete process.env.SUPABASE_SECRET_KEY;

    await broadcastResponse({
      conversationId: "conv-456",
      response: mockResponse,
    });

    expect(mockChannel).toHaveBeenCalled();
  });
});

describe("getFeedChannelName", () => {
  it("returns correct channel name format", () => {
    expect(getFeedChannelName("conv-123")).toBe("feed:conv-123");
    expect(getFeedChannelName("abc-def-ghi")).toBe("feed:abc-def-ghi");
  });
});

describe("FEED_BROADCAST_EVENT", () => {
  it("has correct event name", () => {
    expect(FEED_BROADCAST_EVENT).toBe("new_response");
  });
});
