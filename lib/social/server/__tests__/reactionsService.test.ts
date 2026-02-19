/**
 * Unit tests for reactionsService
 *
 * Tests reaction add and fetch logic with mocked Supabase client
 */

import { addReaction, getRecentReactions } from "../reactionsService";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("reactionsService", () => {
  const mockUserId = "user-123";
  const mockHiveId = "hive-456";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("addReaction", () => {
    const createMockSupabase = (upsertResult: {
      error: Error | null;
    }): SupabaseClient => {
      return {
        from: jest.fn().mockReturnValue({
          upsert: jest.fn().mockResolvedValue(upsertResult),
        }),
      } as unknown as SupabaseClient;
    };

    it("should upsert reaction with emoji and message", async () => {
      const supabase = createMockSupabase({ error: null });

      await addReaction(supabase, mockUserId, {
        hiveId: mockHiveId,
        emoji: "👋",
        message: "Hello!",
      });

      expect(supabase.from).toHaveBeenCalledWith("hive_reactions");
      expect(supabase.from("hive_reactions").upsert).toHaveBeenCalledWith(
        {
          hive_id: mockHiveId,
          user_id: mockUserId,
          emoji: "👋",
          message: "Hello!",
        },
        { onConflict: "hive_id,user_id,emoji" }
      );
    });

    it("should allow null message", async () => {
      const supabase = createMockSupabase({ error: null });

      await addReaction(supabase, mockUserId, {
        hiveId: mockHiveId,
        emoji: "🎉",
      });

      expect(supabase.from("hive_reactions").upsert).toHaveBeenCalledWith(
        expect.objectContaining({ message: null }),
        expect.any(Object)
      );
    });

    it("should throw error when upsert fails", async () => {
      const mockError = new Error("Database connection lost");
      const supabase = createMockSupabase({ error: mockError });

      await expect(
        addReaction(supabase, mockUserId, {
          hiveId: mockHiveId,
          emoji: "👋",
        })
      ).rejects.toThrow("Failed to add reaction");
    });
  });

  describe("getRecentReactions", () => {
    const mockReactions = [
      {
        id: "react-1",
        hive_id: mockHiveId,
        user_id: mockUserId,
        emoji: "👋",
        message: "Hi!",
        created_at: "2026-02-19T10:00:00Z",
      },
      {
        id: "react-2",
        hive_id: mockHiveId,
        user_id: "user-456",
        emoji: "🎉",
        message: null,
        created_at: "2026-02-19T09:00:00Z",
      },
    ];

    const createMockSupabase = (
      data: unknown[],
      error: Error | null = null
    ): SupabaseClient => {
      return {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data, error }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;
    };

    it("should fetch recent reactions for a hive", async () => {
      const supabase = createMockSupabase(mockReactions);

      const result = await getRecentReactions(supabase, mockHiveId, 10);

      expect(result).toHaveLength(2);
      expect(result[0].emoji).toBe("👋");
      expect(result[0].message).toBe("Hi!");
      expect(result[1].emoji).toBe("🎉");
      expect(result[1].message).toBeNull();
    });

    it("should transform snake_case to camelCase", async () => {
      const supabase = createMockSupabase(mockReactions);

      const result = await getRecentReactions(supabase, mockHiveId, 10);

      expect(result[0]).toEqual({
        id: "react-1",
        hiveId: mockHiveId,
        userId: mockUserId,
        emoji: "👋",
        message: "Hi!",
        createdAt: "2026-02-19T10:00:00Z",
      });
    });

    it("should call supabase with correct query chain", async () => {
      const supabase = createMockSupabase([]);

      await getRecentReactions(supabase, mockHiveId, 15);

      expect(supabase.from).toHaveBeenCalledWith("hive_reactions");
      const fromResult = supabase.from("hive_reactions");
      expect(fromResult.select).toHaveBeenCalledWith(
        "id, hive_id, user_id, emoji, message, created_at"
      );
    });

    it("should return empty array on error", async () => {
      const supabase = createMockSupabase([], new Error("Database error"));

      const result = await getRecentReactions(supabase, mockHiveId, 10);

      expect(result).toEqual([]);
    });

    it("should use default limit of 20", async () => {
      const mockLimit = jest.fn().mockResolvedValue({ data: [], error: null });
      const supabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: mockLimit,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      await getRecentReactions(supabase, mockHiveId);

      expect(mockLimit).toHaveBeenCalledWith(20);
    });
  });
});
