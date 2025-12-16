/**
 * Unit Tests for Hive Admin Authorization
 *
 * Tests authorization logic with mocked dependencies
 * Demonstrates testability through dependency injection
 */

import { authorizeHiveAdmin, requireHiveAdmin } from "./authorizeHiveAdmin";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock Supabase client
const createMockSupabase = (
  mockData: { role: string } | null,
  mockError: { message: string } | null = null
): SupabaseClient => {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockData,
              error: mockError,
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
};

describe("authorizeHiveAdmin", () => {
  const userId = "user-123";
  const hiveId = "hive-456";

  it("should return true when user is an admin", async () => {
    const supabase = createMockSupabase({ role: "admin" });

    const result = await authorizeHiveAdmin(supabase, userId, hiveId);

    expect(result).toBe(true);
  });

  it("should return false when user is a member but not admin", async () => {
    const supabase = createMockSupabase({ role: "member" });

    const result = await authorizeHiveAdmin(supabase, userId, hiveId);

    expect(result).toBe(false);
  });

  it("should return false when user is not a member", async () => {
    const supabase = createMockSupabase(null);

    const result = await authorizeHiveAdmin(supabase, userId, hiveId);

    expect(result).toBe(false);
  });

  it("should return false when database query fails", async () => {
    const supabase = createMockSupabase(null, { message: "Database error" });

    const result = await authorizeHiveAdmin(supabase, userId, hiveId);

    expect(result).toBe(false);
  });

  it("should query correct table and columns", async () => {
    const mockSupabase = createMockSupabase({ role: "admin" });

    await authorizeHiveAdmin(mockSupabase, userId, hiveId);

    expect(mockSupabase.from).toHaveBeenCalledWith("hive_members");
  });
});

describe("requireHiveAdmin", () => {
  const userId = "user-123";
  const hiveId = "hive-456";

  it("should not throw when user is an admin", async () => {
    const supabase = createMockSupabase({ role: "admin" });

    await expect(requireHiveAdmin(supabase, userId, hiveId)).resolves.not.toThrow();
  });

  it("should throw when user is not an admin", async () => {
    const supabase = createMockSupabase({ role: "member" });

    await expect(requireHiveAdmin(supabase, userId, hiveId)).rejects.toThrow(
      "Unauthorized: Admin access required"
    );
  });

  it("should throw when user is not a member", async () => {
    const supabase = createMockSupabase(null);

    await expect(requireHiveAdmin(supabase, userId, hiveId)).rejects.toThrow(
      "Unauthorized: Admin access required"
    );
  });

  it("should throw when database query fails", async () => {
    const supabase = createMockSupabase(null, { message: "Database error" });

    await expect(requireHiveAdmin(supabase, userId, hiveId)).rejects.toThrow(
      "Unauthorized: Admin access required"
    );
  });
});
