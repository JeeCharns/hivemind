/**
 * Unit tests for updateAccountProfile service
 *
 * Tests account profile update logic (thin wrapper around upsertProfile)
 */

import { updateAccountProfile } from "../updateAccountProfile";
import { upsertProfile } from "@/lib/profile/server/upsertProfile";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock upsertProfile
jest.mock("@/lib/profile/server/upsertProfile");

const mockUpsertProfile = upsertProfile as jest.MockedFunction<
  typeof upsertProfile
>;

describe("updateAccountProfile", () => {
  let mockSupabase: Partial<SupabaseClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = {} as Partial<SupabaseClient>;
  });

  it("should update profile with display name only", async () => {
    mockUpsertProfile.mockResolvedValue({
      id: "user-123",
      displayName: "Jane Doe",
      avatarUrl: null,
    });

    const result = await updateAccountProfile(
      mockSupabase as SupabaseClient,
      "user-123",
      {
        displayName: "Jane Doe",
      }
    );

    expect(result).toEqual({
      displayName: "Jane Doe",
      avatarUrl: null,
    });

    expect(mockUpsertProfile).toHaveBeenCalledWith(
      mockSupabase,
      "user-123",
      {
        displayName: "Jane Doe",
      }
    );
  });

  it("should update profile with display name and avatar", async () => {
    mockUpsertProfile.mockResolvedValue({
      id: "user-123",
      displayName: "Jane Doe",
      avatarUrl: "https://example.com/avatars/user-123/avatar.png",
    });

    const result = await updateAccountProfile(
      mockSupabase as SupabaseClient,
      "user-123",
      {
        displayName: "Jane Doe",
        avatarFile: {
          buffer: Buffer.from("test"),
          fileName: "avatar.png",
          contentType: "image/png",
        },
      }
    );

    expect(result).toEqual({
      displayName: "Jane Doe",
      avatarUrl: "https://example.com/avatars/user-123/avatar.png",
    });

    expect(mockUpsertProfile).toHaveBeenCalledWith(
      mockSupabase,
      "user-123",
      expect.objectContaining({
        displayName: "Jane Doe",
        avatarFile: expect.objectContaining({
          fileName: "avatar.png",
          contentType: "image/png",
        }),
      })
    );
  });

  it("should omit id from response (account API contract)", async () => {
    mockUpsertProfile.mockResolvedValue({
      id: "user-123",
      displayName: "Jane Doe",
      avatarUrl: "https://example.com/avatars/user-123/avatar.png",
    });

    const result = await updateAccountProfile(
      mockSupabase as SupabaseClient,
      "user-123",
      {
        displayName: "Jane Doe",
      }
    );

    // Should not include id in response
    expect(result).not.toHaveProperty("id");
    expect(result).toEqual({
      displayName: "Jane Doe",
      avatarUrl: "https://example.com/avatars/user-123/avatar.png",
    });
  });

  it("should propagate upsertProfile errors", async () => {
    mockUpsertProfile.mockRejectedValue(
      new Error("Failed to update profile: Database error")
    );

    await expect(
      updateAccountProfile(mockSupabase as SupabaseClient, "user-123", {
        displayName: "Jane Doe",
      })
    ).rejects.toThrow("Failed to update profile: Database error");

    expect(mockUpsertProfile).toHaveBeenCalledWith(
      mockSupabase,
      "user-123",
      {
        displayName: "Jane Doe",
      }
    );
  });

  it("should propagate avatar upload errors", async () => {
    mockUpsertProfile.mockRejectedValue(
      new Error("Avatar upload failed: Storage full")
    );

    await expect(
      updateAccountProfile(mockSupabase as SupabaseClient, "user-123", {
        displayName: "Jane Doe",
        avatarFile: {
          buffer: Buffer.from("test"),
          fileName: "avatar.png",
          contentType: "image/png",
        },
      })
    ).rejects.toThrow("Avatar upload failed: Storage full");
  });
});
