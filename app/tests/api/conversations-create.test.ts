/** @jest-environment node */
/**
 * Integration tests for POST /api/conversations
 *
 * Tests conversation creation with authentication and authorization
 */

import { POST } from "@/app/api/conversations/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/conversations/server/createConversation");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { createConversation } from "@/lib/conversations/server/createConversation";

describe("POST /api/conversations", () => {
  const mockRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
  const mockCreateConversation = createConversation as jest.MockedFunction<
    typeof createConversation
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockRequireAuth.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com", name: "Test User" },
      activeHiveId: undefined,
      roles: [],
    });

    mockSupabaseServerClient.mockResolvedValue(
      {} as Awaited<ReturnType<typeof supabaseServerClient>>
    );
  });

  it("should create conversation with valid input", async () => {
    mockCreateConversation.mockResolvedValue({
      id: "conv-123",
      slug: "conv-slug",
    });

    const request = new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        hiveId: "11111111-1111-4111-8111-111111111111",
        type: "understand",
        title: "Test Session",
        description: "Test description",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.id).toBe("conv-123");
    expect(mockCreateConversation).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      {
        hiveId: "11111111-1111-4111-8111-111111111111",
        type: "understand",
        title: "Test Session",
        description: "Test description",
      }
    );
  });

  it("should reject invalid conversation type", async () => {
    const request = new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        hiveId: "11111111-1111-4111-8111-111111111111",
        type: "invalid_type",
        title: "Test Session",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid request body");
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("should reject missing title", async () => {
    const request = new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        hiveId: "11111111-1111-4111-8111-111111111111",
        type: "understand",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid request body");
  });

  it("should reject invalid hiveId format", async () => {
    const request = new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        hiveId: "not-a-uuid",
        type: "understand",
        title: "Test Session",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid request body");
  });

  it("should handle unauthorized user", async () => {
    mockCreateConversation.mockRejectedValue(
      new Error("Unauthorized: User is not a member of this hive")
    );

    const request = new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        hiveId: "11111111-1111-4111-8111-111111111111",
        type: "understand",
        title: "Test Session",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Unauthorized");
    expect(data.code).toBe("UNAUTHORIZED");
  });

  it("should handle server errors", async () => {
    mockCreateConversation.mockRejectedValue(new Error("Database error"));

    const request = new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        hiveId: "11111111-1111-4111-8111-111111111111",
        type: "understand",
        title: "Test Session",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to create conversation");
    expect(data.code).toBe("INTERNAL_ERROR");
  });

  it("should accept conversation without description", async () => {
    mockCreateConversation.mockResolvedValue({
      id: "conv-123",
      slug: "conv-slug",
    });

    const request = new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        hiveId: "11111111-1111-4111-8111-111111111111",
        type: "decide",
        title: "Test Session",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockCreateConversation).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      {
        hiveId: "11111111-1111-4111-8111-111111111111",
        type: "decide",
        title: "Test Session",
        description: undefined,
      }
    );
  });
});
