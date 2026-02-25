/**
 * @jest-environment node
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { migrateGuestSession } from "../migrateGuestSession";

// ── Helpers ──────────────────────────────────────────────

interface RpcResult {
  data: {
    responses_count: number;
    likes_count: number;
    feedback_count: number;
    hive_ids: string[] | null;
  } | null;
  error: { message: string } | null;
}

function createMockSupabase(rpcResult: RpcResult): SupabaseClient {
  return {
    rpc: jest.fn().mockResolvedValue(rpcResult),
  } as unknown as SupabaseClient;
}

describe("migrateGuestSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("migrates responses, likes, feedback and joins hives", async () => {
    const mockClient = createMockSupabase({
      data: {
        responses_count: 3,
        likes_count: 5,
        feedback_count: 8,
        hive_ids: ["hive-001", "hive-002"],
      },
      error: null,
    });

    const result = await migrateGuestSession(mockClient, {
      userId: "user-123",
      guestSessionId: "gs-001",
      keepAnonymous: false,
    });

    expect(mockClient.rpc).toHaveBeenCalledWith("migrate_guest_session", {
      p_user_id: "user-123",
      p_guest_session_id: "gs-001",
      p_keep_anonymous: false,
    });

    expect(result).toEqual({
      responsesCount: 3,
      likesCount: 5,
      feedbackCount: 8,
      hiveIds: ["hive-001", "hive-002"],
    });
  });

  it("handles empty hive_ids array", async () => {
    const mockClient = createMockSupabase({
      data: {
        responses_count: 1,
        likes_count: 0,
        feedback_count: 2,
        hive_ids: [],
      },
      error: null,
    });

    const result = await migrateGuestSession(mockClient, {
      userId: "user-456",
      guestSessionId: "gs-002",
      keepAnonymous: true,
    });

    expect(result).toEqual({
      responsesCount: 1,
      likesCount: 0,
      feedbackCount: 2,
      hiveIds: [],
    });
  });

  it("handles null hive_ids gracefully", async () => {
    const mockClient = createMockSupabase({
      data: {
        responses_count: 0,
        likes_count: 0,
        feedback_count: 0,
        hive_ids: null,
      },
      error: null,
    });

    const result = await migrateGuestSession(mockClient, {
      userId: "user-789",
      guestSessionId: "gs-003",
      keepAnonymous: false,
    });

    expect(result).toEqual({
      responsesCount: 0,
      likesCount: 0,
      feedbackCount: 0,
      hiveIds: [],
    });
  });

  it("throws on database error", async () => {
    const mockClient = createMockSupabase({
      data: null,
      error: { message: "Database error" },
    });

    await expect(
      migrateGuestSession(mockClient, {
        userId: "user-123",
        guestSessionId: "gs-001",
        keepAnonymous: true,
      })
    ).rejects.toThrow("Failed to migrate guest session");
  });

  it("throws when data is null without error", async () => {
    const mockClient = createMockSupabase({
      data: null,
      error: null,
    });

    await expect(
      migrateGuestSession(mockClient, {
        userId: "user-123",
        guestSessionId: "gs-001",
        keepAnonymous: false,
      })
    ).rejects.toThrow("Failed to migrate guest session");
  });
});
