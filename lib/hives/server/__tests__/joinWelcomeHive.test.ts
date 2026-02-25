import { joinWelcomeHive } from "../joinWelcomeHive";
import { WELCOME_HIVE_ID } from "../../constants";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("joinWelcomeHive", () => {
  const mockUserId = "user-123";

  const createMockSupabase = (options: {
    hiveExists: boolean;
    upsertError?: Error | null;
  }): SupabaseClient => {
    const mockUpsert = jest.fn().mockResolvedValue({
      error: options.upsertError || null,
    });

    const mockMaybeSingle = jest.fn().mockResolvedValue({
      data: options.hiveExists ? { id: WELCOME_HIVE_ID } : null,
      error: null,
    });

    return {
      from: jest.fn((table: string) => {
        if (table === "hives") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: mockMaybeSingle,
              }),
            }),
          };
        }
        return {
          upsert: mockUpsert,
        };
      }),
    } as unknown as SupabaseClient;
  };

  it("should upsert membership for Welcome Hive when hive exists", async () => {
    const supabase = createMockSupabase({ hiveExists: true });

    const result = await joinWelcomeHive(supabase, mockUserId);

    expect(result).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith("hives");
    expect(supabase.from).toHaveBeenCalledWith("hive_members");
    expect(supabase.from("hive_members").upsert).toHaveBeenCalledWith(
      {
        hive_id: WELCOME_HIVE_ID,
        user_id: mockUserId,
        role: "member",
      },
      { onConflict: "hive_id,user_id" }
    );
  });

  it("should return false when Welcome Hive does not exist", async () => {
    const supabase = createMockSupabase({ hiveExists: false });
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    const result = await joinWelcomeHive(supabase, mockUserId);

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[joinWelcomeHive] Welcome Hive not found, skipping auto-join"
    );
    // Should not attempt upsert
    expect(supabase.from).not.toHaveBeenCalledWith("hive_members");

    consoleSpy.mockRestore();
  });

  it("should not throw on duplicate membership (idempotent)", async () => {
    const supabase = createMockSupabase({ hiveExists: true });

    // Should not throw and return true
    await expect(joinWelcomeHive(supabase, mockUserId)).resolves.toBe(true);
  });

  it("should throw on database error", async () => {
    const supabase = createMockSupabase({
      hiveExists: true,
      upsertError: new Error("Database error"),
    });

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    await expect(joinWelcomeHive(supabase, mockUserId)).rejects.toThrow(
      "Failed to join Welcome Hive"
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      "[joinWelcomeHive] Error:",
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
