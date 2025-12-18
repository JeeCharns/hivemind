/** @jest-environment node */
/**
 * Integration tests for profile API routes
 *
 * Tests profile status and update endpoints with authentication and validation
 */

import { GET as getStatus } from "@/app/api/profile/status/route";
import { POST as postProfile } from "@/app/api/profile/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/profile/server/getProfileStatus");
jest.mock("@/lib/profile/server/upsertProfile");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { getProfileStatus } from "@/lib/profile/server/getProfileStatus";
import { upsertProfile } from "@/lib/profile/server/upsertProfile";

describe("GET /api/profile/status", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockGetProfileStatus = getProfileStatus as jest.MockedFunction<
    typeof getProfileStatus
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

  it("should return profile status for authenticated user", async () => {
    mockGetProfileStatus.mockResolvedValue({
      hasProfile: true,
      needsSetup: false,
    });

    const response = await getStatus();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasProfile).toBe(true);
    expect(data.needsSetup).toBe(false);
    expect(mockGetProfileStatus).toHaveBeenCalledWith(
      expect.anything(),
      "user-123"
    );
  });

  it("should indicate setup needed when profile incomplete", async () => {
    mockGetProfileStatus.mockResolvedValue({
      hasProfile: true,
      needsSetup: true,
    });

    const response = await getStatus();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasProfile).toBe(true);
    expect(data.needsSetup).toBe(true);
  });

  it("should indicate no profile when user has no profile row", async () => {
    mockGetProfileStatus.mockResolvedValue({
      hasProfile: false,
      needsSetup: true,
    });

    const response = await getStatus();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasProfile).toBe(false);
    expect(data.needsSetup).toBe(true);
  });

  it("should reject unauthenticated user", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await getStatus();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized: Not authenticated");
    expect(mockGetProfileStatus).not.toHaveBeenCalled();
  });

  it("should handle service errors", async () => {
    mockGetProfileStatus.mockRejectedValue(new Error("Database error"));

    const response = await getStatus();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
    expect(data.code).toBe("INTERNAL_ERROR");
  });
});

describe("POST /api/profile", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockUpsertProfile = upsertProfile as jest.MockedFunction<
    typeof upsertProfile
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

  it("should create profile with valid display name", async () => {
    mockUpsertProfile.mockResolvedValue({
      id: "user-123",
      displayName: "John Doe",
      avatarUrl: null,
    });

    const formData = new FormData();
    formData.append("displayName", "John Doe");

    const request = new NextRequest("http://localhost/api/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postProfile(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("user-123");
    expect(data.displayName).toBe("John Doe");
    expect(data.avatarUrl).toBeNull();
    expect(mockUpsertProfile).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      {
        displayName: "John Doe",
        avatarFile: null,
      }
    );
  });

  it("should reject empty display name", async () => {
    const formData = new FormData();
    formData.append("displayName", "");

    const request = new NextRequest("http://localhost/api/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postProfile(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Display name is required");
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it("should reject display name too long", async () => {
    const longName = "a".repeat(61);
    const formData = new FormData();
    formData.append("displayName", longName);

    const request = new NextRequest("http://localhost/api/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postProfile(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Display name must be 60 characters or less");
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject missing displayName field", async () => {
    const formData = new FormData();

    const request = new NextRequest("http://localhost/api/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postProfile(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject unauthenticated user", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const formData = new FormData();
    formData.append("displayName", "John Doe");

    const request = new NextRequest("http://localhost/api/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postProfile(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized: Not authenticated");
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it("should handle upload errors", async () => {
    mockUpsertProfile.mockRejectedValue(
      new Error("Avatar upload failed: Storage error")
    );

    const formData = new FormData();
    formData.append("displayName", "John Doe");

    const request = new NextRequest("http://localhost/api/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postProfile(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Avatar upload failed");
    expect(data.code).toBe("UPLOAD_FAILED");
  });

  it("should handle database errors", async () => {
    mockUpsertProfile.mockRejectedValue(
      new Error("Failed to update profile: Connection lost")
    );

    const formData = new FormData();
    formData.append("displayName", "John Doe");

    const request = new NextRequest("http://localhost/api/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postProfile(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update profile");
    expect(data.code).toBe("DB_ERROR");
  });

  it("should trim whitespace from display name", async () => {
    mockUpsertProfile.mockResolvedValue({
      id: "user-123",
      displayName: "John Doe",
      avatarUrl: null,
    });

    const formData = new FormData();
    formData.append("displayName", "  John Doe  ");

    const request = new NextRequest("http://localhost/api/profile", {
      method: "POST",
      body: formData,
    });

    const response = await postProfile(request);

    expect(response.status).toBe(200);
    expect(mockUpsertProfile).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      {
        displayName: "John Doe",
        avatarFile: null,
      }
    );
  });
});
