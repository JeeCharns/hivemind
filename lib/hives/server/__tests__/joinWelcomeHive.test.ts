import { joinWelcomeHive } from "../joinWelcomeHive";
import { WELCOME_HIVE_ID } from "../../constants";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("joinWelcomeHive", () => {
  const mockUserId = "user-123";

  const createMockSupabase = (upsertResult: {
    error: Error | null;
  }): SupabaseClient => {
    return {
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockResolvedValue(upsertResult),
      }),
    } as unknown as SupabaseClient;
  };

  it("should upsert membership for Welcome Hive", async () => {
    const supabase = createMockSupabase({ error: null });

    await joinWelcomeHive(supabase, mockUserId);

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

  it("should not throw on duplicate membership (idempotent)", async () => {
    const supabase = createMockSupabase({ error: null });

    // Should not throw
    await expect(joinWelcomeHive(supabase, mockUserId)).resolves.not.toThrow();
  });

  it("should throw on database error", async () => {
    const supabase = createMockSupabase({
      error: new Error("Database error"),
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
