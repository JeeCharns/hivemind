/** @jest-environment node */
/**
 * Integration tests for GET /api/hives/search
 *
 * Tests hive search with authentication and validation
 */

import { GET } from "@/app/api/hives/search/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/hives/server/searchJoinableHives");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { searchJoinableHives } from "@/lib/hives/server/searchJoinableHives";

describe("GET /api/hives/search", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockSearchJoinableHives = searchJoinableHives as jest.MockedFunction<
    typeof searchJoinableHives
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

  it("should search hives with valid term", async () => {
    mockSearchJoinableHives.mockResolvedValue([
      {
        id: "hive-1",
        name: "Test Hive",
        slug: "test-hive",
        alreadyMember: false,
      },
      {
        id: "hive-2",
        name: "Test Org",
        slug: "test-org",
        alreadyMember: true,
      },
    ]);

    const request = new NextRequest(
      "http://localhost/api/hives/search?term=test&limit=5"
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toHaveLength(2);
    expect(data.results[0].name).toBe("Test Hive");
    expect(data.results[0].alreadyMember).toBe(false);
    expect(data.results[1].alreadyMember).toBe(true);
    expect(mockSearchJoinableHives).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      {
        term: "test",
        limit: 5,
      }
    );
  });

  it("should use default limit when not provided", async () => {
    mockSearchJoinableHives.mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost/api/hives/search?term=test"
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockSearchJoinableHives).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      {
        term: "test",
        limit: 5, // default
      }
    );
  });

  it("should reject empty search term", async () => {
    const request = new NextRequest("http://localhost/api/hives/search?term=");

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Search term required");
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(mockSearchJoinableHives).not.toHaveBeenCalled();
  });

  it("should reject whitespace-only search term", async () => {
    const request = new NextRequest(
      "http://localhost/api/hives/search?term=   "
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Search term required");
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject missing search term", async () => {
    const request = new NextRequest("http://localhost/api/hives/search");

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Search term required");
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject search term too long", async () => {
    const longTerm = "a".repeat(81);
    const request = new NextRequest(
      `http://localhost/api/hives/search?term=${longTerm}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Search term too long");
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject invalid limit", async () => {
    const request = new NextRequest(
      "http://localhost/api/hives/search?term=test&limit=invalid"
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject limit out of range (too high)", async () => {
    const request = new NextRequest(
      "http://localhost/api/hives/search?term=test&limit=11"
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject limit out of range (too low)", async () => {
    const request = new NextRequest(
      "http://localhost/api/hives/search?term=test&limit=0"
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject unauthenticated user", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/hives/search?term=test"
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized: Not authenticated");
    expect(mockSearchJoinableHives).not.toHaveBeenCalled();
  });

  it("should return empty results when no hives match", async () => {
    mockSearchJoinableHives.mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost/api/hives/search?term=nonexistent"
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toEqual([]);
  });

  it("should handle service errors", async () => {
    mockSearchJoinableHives.mockRejectedValue(new Error("Database error"));

    const request = new NextRequest(
      "http://localhost/api/hives/search?term=test"
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });

  it("should trim search term", async () => {
    mockSearchJoinableHives.mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost/api/hives/search?term=  test  "
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockSearchJoinableHives).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      {
        term: "test", // trimmed
        limit: 5,
      }
    );
  });
});
