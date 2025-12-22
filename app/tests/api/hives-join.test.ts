/** @jest-environment node */
/**
 * Integration tests for POST /api/hives/[hiveId]/join
 *
 * Tests hive joining with authentication and validation
 */

import { POST } from "@/app/api/hives/[hiveId]/join/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/hives/server/joinHive");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { joinHive } from "@/lib/hives/server/joinHive";

describe("POST /api/hives/[hiveId]/join", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockJoinHive = joinHive as jest.MockedFunction<typeof joinHive>;
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

  it("should join hive with valid UUID", async () => {
    mockJoinHive.mockResolvedValue({
      hiveId: "11111111-1111-4111-8111-111111111111",
      hiveKey: "test-hive",
    });

    const request = new NextRequest(
      "http://localhost/api/hives/11111111-1111-4111-8111-111111111111/join",
      {
        method: "POST",
      }
    );

    const params = Promise.resolve({
      hiveId: "11111111-1111-4111-8111-111111111111",
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hiveId).toBe("11111111-1111-4111-8111-111111111111");
    expect(data.hiveKey).toBe("test-hive");
    expect(mockJoinHive).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "user-123",
        email: "test@example.com",
      }),
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("should return hiveKey with ID fallback when slug is null", async () => {
    mockJoinHive.mockResolvedValue({
      hiveId: "11111111-1111-4111-8111-111111111111",
      hiveKey: "11111111-1111-4111-8111-111111111111", // fallback to ID
    });

    const request = new NextRequest(
      "http://localhost/api/hives/11111111-1111-4111-8111-111111111111/join",
      {
        method: "POST",
      }
    );

    const params = Promise.resolve({
      hiveId: "11111111-1111-4111-8111-111111111111",
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hiveKey).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("should reject invalid UUID format", async () => {
    const request = new NextRequest(
      "http://localhost/api/hives/not-a-uuid/join",
      {
        method: "POST",
      }
    );

    const params = Promise.resolve({ hiveId: "not-a-uuid" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid hive ID");
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(mockJoinHive).not.toHaveBeenCalled();
  });

  it("should reject unauthenticated user", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/hives/11111111-1111-4111-8111-111111111111/join",
      {
        method: "POST",
      }
    );

    const params = Promise.resolve({
      hiveId: "11111111-1111-4111-8111-111111111111",
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized: Not authenticated");
    expect(mockJoinHive).not.toHaveBeenCalled();
  });

  it("should handle non-existent hive", async () => {
    mockJoinHive.mockRejectedValue(new Error("Hive not found"));

    const request = new NextRequest(
      "http://localhost/api/hives/11111111-1111-4111-8111-111111111111/join",
      {
        method: "POST",
      }
    );

    const params = Promise.resolve({
      hiveId: "11111111-1111-4111-8111-111111111111",
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Hive not found");
  });

  it("should handle database errors", async () => {
    mockJoinHive.mockRejectedValue(new Error("Database connection failed"));

    const request = new NextRequest(
      "http://localhost/api/hives/11111111-1111-4111-8111-111111111111/join",
      {
        method: "POST",
      }
    );

    const params = Promise.resolve({
      hiveId: "11111111-1111-4111-8111-111111111111",
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
    expect(data.code).toBe("INTERNAL_ERROR");
  });

  it("should be idempotent (joining same hive twice succeeds)", async () => {
    mockJoinHive.mockResolvedValue({
      hiveId: "11111111-1111-4111-8111-111111111111",
      hiveKey: "test-hive",
    });

    const request = new NextRequest(
      "http://localhost/api/hives/11111111-1111-4111-8111-111111111111/join",
      {
        method: "POST",
      }
    );

    const params = Promise.resolve({
      hiveId: "11111111-1111-4111-8111-111111111111",
    });

    // First join
    const response1 = await POST(request, { params });
    expect(response1.status).toBe(200);

    // Second join (idempotent)
    const response2 = await POST(request, {
      params: Promise.resolve({ hiveId: "11111111-1111-4111-8111-111111111111" }),
    });
    const data2 = await response2.json();

    expect(response2.status).toBe(200);
    expect(data2.hiveId).toBe("11111111-1111-4111-8111-111111111111");
    expect(mockJoinHive).toHaveBeenCalledTimes(2);
  });

  it("should reject malformed UUID", async () => {
    const request = new NextRequest(
      "http://localhost/api/hives/11111111-1111-1111-1111-111111111111/join",
      {
        method: "POST",
      }
    );

    const params = Promise.resolve({
      hiveId: "11111111-1111-1111-1111-111111111111", // Invalid UUID v4 format
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid hive ID");
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should handle empty hiveId", async () => {
    const request = new NextRequest("http://localhost/api/hives//join", {
      method: "POST",
    });

    const params = Promise.resolve({ hiveId: "" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid hive ID");
    expect(data.code).toBe("VALIDATION_ERROR");
  });
});
