/**
 * Unit tests for getAccountSettings service
 *
 * Tests account settings retrieval logic with mocked Supabase client
 */

import { getAccountSettings } from "../getAccountSettings";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("getAccountSettings", () => {
  let mockSupabase: Partial<SupabaseClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      storage: {
        from: jest.fn().mockReturnThis(),
        createSignedUrl: jest.fn(),
        getPublicUrl: jest.fn(),
      } as unknown as SupabaseClient["storage"],
    } as Partial<SupabaseClient>;
  });

  it("should return account settings with profile data", async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            display_name: "John Doe",
            avatar_path: "user-123/avatar.png",
          },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as jest.Mock).mockReturnValue({
      select: mockSelect,
    });

    const mockCreateSignedUrl = jest.fn().mockResolvedValue({
      data: {
        signedUrl: "https://example.com/signed/user-123/avatar.png",
      },
      error: null,
    });

    (mockSupabase.storage!.from as jest.Mock).mockReturnValue({
      createSignedUrl: mockCreateSignedUrl,
      getPublicUrl: jest.fn(),
    });

    const result = await getAccountSettings(
      mockSupabase as SupabaseClient,
      "user-123",
      "test@example.com"
    );

    expect(result).toEqual({
      email: "test@example.com",
      displayName: "John Doe",
      avatarUrl: "https://example.com/signed/user-123/avatar.png",
    });

    expect(mockSelect).toHaveBeenCalledWith("display_name, avatar_path");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      "user-123/avatar.png",
      3600
    );
  });

  it("should return null avatar when no avatar_path", async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            display_name: "John Doe",
            avatar_path: null,
          },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as jest.Mock).mockReturnValue({
      select: mockSelect,
    });

    const result = await getAccountSettings(
      mockSupabase as SupabaseClient,
      "user-123",
      "test@example.com"
    );

    expect(result).toEqual({
      email: "test@example.com",
      displayName: "John Doe",
      avatarUrl: null,
    });

    // getPublicUrl should not be called when no avatar_path
    expect(mockSupabase.storage!.from).not.toHaveBeenCalled();
  });

  it("should return null display name when no profile exists", async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }),
    });

    (mockSupabase.from as jest.Mock).mockReturnValue({
      select: mockSelect,
    });

    const result = await getAccountSettings(
      mockSupabase as SupabaseClient,
      "user-123",
      "test@example.com"
    );

    expect(result).toEqual({
      email: "test@example.com",
      displayName: null,
      avatarUrl: null,
    });
  });

  it("should throw error when query fails", async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "Database connection lost" },
        }),
      }),
    });

    (mockSupabase.from as jest.Mock).mockReturnValue({
      select: mockSelect,
    });

    await expect(
      getAccountSettings(
        mockSupabase as SupabaseClient,
        "user-123",
        "test@example.com"
      )
    ).rejects.toThrow("Failed to fetch profile: Database connection lost");
  });

  it("should use correct bucket name for avatar URL", async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            display_name: "John Doe",
            avatar_path: "user-123/avatar.png",
          },
          error: null,
        }),
      }),
    });

    (mockSupabase.from as jest.Mock).mockReturnValue({
      select: mockSelect,
    });

    const mockStorageFrom = jest.fn().mockReturnValue({
      createSignedUrl: jest.fn().mockResolvedValue({
        data: {
          signedUrl: "https://example.com/signed/user-123/avatar.png",
        },
        error: null,
      }),
      getPublicUrl: jest.fn(),
    });

    mockSupabase.storage = {
      from: mockStorageFrom,
    } as unknown as SupabaseClient["storage"];

    await getAccountSettings(
      mockSupabase as SupabaseClient,
      "user-123",
      "test@example.com"
    );

    // Should use AVATAR_BUCKET constant (defaults to "user-avatars")
    expect(mockStorageFrom).toHaveBeenCalledWith("user-avatars");
  });
});
