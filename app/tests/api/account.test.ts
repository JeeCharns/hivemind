/** @jest-environment node */
/**
 * Integration tests for account API routes
 *
 * Tests account settings and profile update endpoints with authentication and validation
 */

import { GET as getAccount } from "@/app/api/account/route";
import { POST as postAccountProfile } from "@/app/api/account/profile/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/account/server/getAccountSettings");
jest.mock("@/lib/account/server/updateAccountProfile");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { getAccountSettings } from "@/lib/account/server/getAccountSettings";
import { updateAccountProfile } from "@/lib/account/server/updateAccountProfile";

describe("GET /api/account", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockGetAccountSettings = getAccountSettings as jest.MockedFunction<
    typeof getAccountSettings
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);

    mockSupabaseServerClient.mockResolvedValue(
      {} as Awaited<ReturnType<typeof supabaseServerClient>>
    );
  });

  it("should return account settings for authenticated user", async () => {
    mockGetAccountSettings.mockResolvedValue({
      email: "test@example.com",
      displayName: "John Doe",
      avatarUrl: "https://example.com/avatar.png",
    });

    const response = await getAccount();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.email).toBe("test@example.com");
    expect(data.displayName).toBe("John Doe");
    expect(data.avatarUrl).toBe("https://example.com/avatar.png");
    expect(mockGetAccountSettings).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      "test@example.com"
    );
  });

  it("should return null avatar when user has no avatar", async () => {
    mockGetAccountSettings.mockResolvedValue({
      email: "test@example.com",
      displayName: "John Doe",
      avatarUrl: null,
    });

    const response = await getAccount();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.avatarUrl).toBeNull();
  });

  it("should return null display name when user has no profile", async () => {
    mockGetAccountSettings.mockResolvedValue({
      email: "test@example.com",
      displayName: null,
      avatarUrl: null,
    });

    const response = await getAccount();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.displayName).toBeNull();
  });

  it("should reject unauthenticated user", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await getAccount();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized: Not authenticated");
    expect(mockGetAccountSettings).not.toHaveBeenCalled();
  });

  it("should handle service errors", async () => {
    mockGetAccountSettings.mockRejectedValue(new Error("Database error"));

    const response = await getAccount();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
    expect(data.code).toBe("INTERNAL_ERROR");
  });
});

describe("POST /api/account/profile", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockUpdateAccountProfile = updateAccountProfile as jest.MockedFunction<
    typeof updateAccountProfile
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);

    mockSupabaseServerClient.mockResolvedValue(
      {} as Awaited<ReturnType<typeof supabaseServerClient>>
    );
  });

  it("should update profile with valid display name", async () => {
    mockUpdateAccountProfile.mockResolvedValue({
      displayName: "Jane Smith",
      avatarUrl: null,
    });

    const formData = new FormData();
    formData.append("displayName", "Jane Smith");

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.displayName).toBe("Jane Smith");
    expect(data.avatarUrl).toBeNull();
    expect(mockUpdateAccountProfile).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      {
        displayName: "Jane Smith",
        avatarFile: null,
      }
    );
  });

  it("should update profile with display name and avatar", async () => {
    mockUpdateAccountProfile.mockResolvedValue({
      displayName: "Jane Smith",
      avatarUrl: "https://example.com/new-avatar.png",
    });

    const formData = new FormData();
    formData.append("displayName", "Jane Smith");
    const avatarBlob = new Blob(["fake-image-data"], { type: "image/png" });
    formData.append("avatar", avatarBlob, "avatar.png");

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.displayName).toBe("Jane Smith");
    expect(data.avatarUrl).toBe("https://example.com/new-avatar.png");
    expect(mockUpdateAccountProfile).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      expect.objectContaining({
        displayName: "Jane Smith",
        avatarFile: expect.objectContaining({
          fileName: "avatar.png",
          contentType: "image/png",
        }),
      })
    );
  });

  it("should reject empty display name", async () => {
    const formData = new FormData();
    formData.append("displayName", "");

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Display name is required");
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(mockUpdateAccountProfile).not.toHaveBeenCalled();
  });

  it("should reject display name too long", async () => {
    const longName = "a".repeat(61);
    const formData = new FormData();
    formData.append("displayName", longName);

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Display name must be 60 characters or less");
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject missing displayName field", async () => {
    const formData = new FormData();

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject avatar file too large", async () => {
    const formData = new FormData();
    formData.append("displayName", "Jane Smith");
    // Create a blob larger than 2MB
    const largeBlob = new Blob([new ArrayBuffer(2.1 * 1024 * 1024)], {
      type: "image/png",
    });
    formData.append("avatar", largeBlob, "large-avatar.png");

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("File size must be less than 2MB");
    expect(data.code).toBe("UPLOAD_FAILED");
  });

  it("should reject invalid avatar file type", async () => {
    const formData = new FormData();
    formData.append("displayName", "Jane Smith");
    const invalidBlob = new Blob(["fake-data"], { type: "application/pdf" });
    formData.append("avatar", invalidBlob, "avatar.pdf");

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("File must be a JPEG, PNG, WebP, or GIF image");
    expect(data.code).toBe("UPLOAD_FAILED");
  });

  it("should reject unauthenticated user", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const formData = new FormData();
    formData.append("displayName", "Jane Smith");

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized: Not authenticated");
    expect(mockUpdateAccountProfile).not.toHaveBeenCalled();
  });

  it("should handle upload errors", async () => {
    mockUpdateAccountProfile.mockRejectedValue(
      new Error("Avatar upload failed: Storage error")
    );

    const formData = new FormData();
    formData.append("displayName", "Jane Smith");

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Avatar upload failed");
    expect(data.code).toBe("UPLOAD_FAILED");
  });

  it("should handle database errors", async () => {
    mockUpdateAccountProfile.mockRejectedValue(
      new Error("Failed to update profile: Connection lost")
    );

    const formData = new FormData();
    formData.append("displayName", "Jane Smith");

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update profile");
    expect(data.code).toBe("DB_ERROR");
  });

  it("should trim whitespace from display name", async () => {
    mockUpdateAccountProfile.mockResolvedValue({
      displayName: "Jane Smith",
      avatarUrl: null,
    });

    const formData = new FormData();
    formData.append("displayName", "  Jane Smith  ");

    const request = new NextRequest("http://localhost/api/account/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postAccountProfile(request);

    expect(response.status).toBe(200);
    expect(mockUpdateAccountProfile).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      {
        displayName: "Jane Smith",
        avatarFile: null,
      }
    );
  });
});
