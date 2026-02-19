import { logActivity, getRecentActivity } from "../activityService";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("activityService", () => {
  describe("logActivity", () => {
    const createMockSupabase = (insertResult: {
      error: Error | null;
    }): SupabaseClient => {
      return {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue(insertResult),
        }),
      } as unknown as SupabaseClient;
    };

    it("should insert activity event", async () => {
      const supabase = createMockSupabase({ error: null });

      await logActivity(supabase, {
        hiveId: "hive-123",
        eventType: "join",
        userId: "user-456",
      });

      expect(supabase.from).toHaveBeenCalledWith("hive_activity");
      expect(supabase.from("hive_activity").insert).toHaveBeenCalledWith({
        hive_id: "hive-123",
        event_type: "join",
        user_id: "user-456",
        metadata: {},
      });
    });

    it("should allow null userId for anonymised events", async () => {
      const supabase = createMockSupabase({ error: null });

      await logActivity(supabase, {
        hiveId: "hive-123",
        eventType: "response",
        userId: null,
        metadata: { count: 1 },
      });

      expect(supabase.from("hive_activity").insert).toHaveBeenCalledWith({
        hive_id: "hive-123",
        event_type: "response",
        user_id: null,
        metadata: { count: 1 },
      });
    });

    it("should handle insert errors gracefully without throwing", async () => {
      const supabase = createMockSupabase({ error: new Error("DB Error") });
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Should not throw
      await expect(
        logActivity(supabase, {
          hiveId: "hive-123",
          eventType: "join",
          userId: "user-456",
        })
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[logActivity] Error:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getRecentActivity", () => {
    const mockActivities = [
      {
        id: "act-1",
        hive_id: "hive-123",
        event_type: "join",
        user_id: "user-1",
        metadata: {},
        created_at: "2026-02-19T10:00:00Z",
      },
    ];

    const createMockSupabase = (data: unknown[]): SupabaseClient => {
      return {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data, error: null }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;
    };

    it("should fetch recent activity for a hive", async () => {
      const supabase = createMockSupabase(mockActivities);

      const result = await getRecentActivity(supabase, "hive-123", 10);

      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe("join");
      expect(result[0].hiveId).toBe("hive-123");
    });

    it("should map database fields to camelCase", async () => {
      const supabase = createMockSupabase(mockActivities);

      const result = await getRecentActivity(supabase, "hive-123", 10);

      expect(result[0]).toEqual({
        id: "act-1",
        hiveId: "hive-123",
        eventType: "join",
        userId: "user-1",
        metadata: {},
        createdAt: "2026-02-19T10:00:00Z",
      });
    });

    it("should return empty array on error", async () => {
      const supabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: null,
                  error: new Error("DB Error"),
                }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await getRecentActivity(supabase, "hive-123", 10);

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[getRecentActivity] Error:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it("should use default limit of 15", async () => {
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

      await getRecentActivity(supabase, "hive-123");

      expect(mockLimit).toHaveBeenCalledWith(15);
    });
  });
});
