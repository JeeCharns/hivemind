/**
 * Unit tests for upsertProfile service
 *
 * Tests profile upsert logic with mocked Supabase client
 */

import { upsertProfile } from "../upsertProfile";
import { uploadAvatar } from "../uploadAvatar";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock uploadAvatar
jest.mock("../uploadAvatar");

const mockUploadAvatar = uploadAvatar as jest.MockedFunction<
  typeof uploadAvatar
>;

describe("upsertProfile", () => {
  let mockSupabase: Partial<SupabaseClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      storage: {
        from: jest.fn().mockReturnThis(),
        getPublicUrl: jest.fn(),
      } as unknown as SupabaseClient["storage"],
    } as Partial<SupabaseClient>;
  });

  it("should upsert profile with display name only", async () => {
    const mockUpsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "user-123",
            display_name: "John Doe",
            avatar_path: null,
          },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as jest.Mock).mockReturnValue({
      upsert: mockUpsert,
    });

    const result = await upsertProfile(
      mockSupabase as SupabaseClient,
      "user-123",
      {
        displayName: "John Doe",
      }
    );

    expect(result).toEqual({
      id: "user-123",
      displayName: "John Doe",
      avatarUrl: null,
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      {
        id: "user-123",
        display_name: "John Doe",
      },
      { onConflict: "id" }
    );
  });

  it("should upsert profile with display name and avatar", async () => {
    mockUploadAvatar.mockResolvedValue({
      path: "user-123/avatar.png",
      publicUrl: "https://example.com/avatars/user-123/avatar.png",
    });

    const mockUpsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "user-123",
            display_name: "John Doe",
            avatar_path: "user-123/avatar.png",
          },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as jest.Mock).mockReturnValue({
      upsert: mockUpsert,
    });

    const result = await upsertProfile(
      mockSupabase as SupabaseClient,
      "user-123",
      {
        displayName: "John Doe",
        avatarFile: {
          buffer: Buffer.from("test"),
          fileName: "avatar.png",
          contentType: "image/png",
        },
      }
    );

    expect(result).toEqual({
      id: "user-123",
      displayName: "John Doe",
      avatarUrl: "https://example.com/avatars/user-123/avatar.png",
    });

    expect(mockUploadAvatar).toHaveBeenCalledWith(
      mockSupabase,
      "user-123",
      expect.any(Buffer),
      "avatar.png",
      "image/png"
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      {
        id: "user-123",
        display_name: "John Doe",
        avatar_path: "user-123/avatar.png",
      },
      { onConflict: "id" }
    );
  });

  it("should throw error when avatar upload fails", async () => {
    mockUploadAvatar.mockRejectedValue(new Error("Storage full"));

    await expect(
      upsertProfile(mockSupabase as SupabaseClient, "user-123", {
        displayName: "John Doe",
        avatarFile: {
          buffer: Buffer.from("test"),
          fileName: "avatar.png",
          contentType: "image/png",
        },
      })
    ).rejects.toThrow("Avatar upload failed: Storage full");

    // Upsert should not be called if upload fails
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("should throw error when upsert fails", async () => {
    const mockUpsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "Database connection lost" },
        }),
      }),
    });

    (mockSupabase.from as jest.Mock).mockReturnValue({
      upsert: mockUpsert,
    });

    await expect(
      upsertProfile(mockSupabase as SupabaseClient, "user-123", {
        displayName: "John Doe",
      })
    ).rejects.toThrow("Failed to update profile: Database connection lost");
  });

  it("should get avatar URL for existing avatar_path", async () => {
    const mockStorageFrom = jest.fn().mockReturnValue({
      createSignedUrl: jest.fn().mockResolvedValue({
        data: {
          signedUrl: "https://example.com/signed/user-123/old-avatar.png",
        },
        error: null,
      }),
      getPublicUrl: jest.fn(),
    });

    mockSupabase.storage = {
      from: mockStorageFrom,
    } as unknown as SupabaseClient["storage"];

    const mockUpsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "user-123",
            display_name: "John Doe",
            avatar_path: "user-123/old-avatar.png",
          },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as jest.Mock).mockReturnValue({
      upsert: mockUpsert,
    });

    const result = await upsertProfile(
      mockSupabase as SupabaseClient,
      "user-123",
      {
        displayName: "John Doe",
      }
    );

    expect(result.avatarUrl).toBe(
      "https://example.com/signed/user-123/old-avatar.png"
    );
    expect(mockStorageFrom).toHaveBeenCalledWith("user-avatars");
  });
});
