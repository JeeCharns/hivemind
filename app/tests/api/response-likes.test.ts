/** @jest-environment node */
/**
 * Integration tests for response likes API
 *
 * Tests POST/DELETE /api/responses/[responseId]/like
 * Covers the insert-with-conflict-handling pattern (not upsert)
 * after migration 043 replaced the unique_like constraint with a partial index.
 */

import { POST, DELETE } from "@/app/api/responses/[responseId]/like/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true }),
  rateLimitResponse: jest.fn(),
}));
jest.mock("@/lib/conversations/server/broadcastLikeUpdate", () => ({
  broadcastLikeUpdate: jest.fn().mockResolvedValue(undefined),
}));

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";

/**
 * Creates a mock Supabase client that supports method chaining.
 * Uses `mockImplementation` so each `.select()` call can return
 * either the chain (for normal selects) or a count-query terminal.
 */
function createSupabaseMock() {
  const mock = {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
  };

  // Default chaining
  mock.from.mockReturnValue(mock);
  mock.select.mockReturnValue(mock);
  mock.eq.mockReturnValue(mock);

  return mock;
}

describe("POST /api/responses/[responseId]/like", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    });
  });

  it("should return 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = new NextRequest(
      "http://localhost/api/responses/resp-1/like",
      { method: "POST" }
    );
    const params = Promise.resolve({ responseId: "resp-1" });
    const response = await POST(request, { params });

    expect(response.status).toBe(401);
  });

  it("should return 404 when response does not exist", async () => {
    const mock = createSupabaseMock();
    mock.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    mockSupabaseServerClient.mockResolvedValue(
      mock as unknown as Awaited<ReturnType<typeof supabaseServerClient>>
    );

    const request = new NextRequest(
      "http://localhost/api/responses/resp-1/like",
      { method: "POST" }
    );
    const params = Promise.resolve({ responseId: "resp-1" });
    const response = await POST(request, { params });

    expect(response.status).toBe(404);
  });

  it("should successfully like a response using insert (not upsert)", async () => {
    const mock = createSupabaseMock();

    // 1. Response lookup: from().select().eq().maybeSingle()
    mock.maybeSingle.mockResolvedValueOnce({
      data: { id: "resp-1", conversation_id: "conv-1" },
      error: null,
    });

    // 2. Insert like: from().insert() → returns { error }
    mock.insert.mockReturnValueOnce({ error: null });

    // 3. Count query: from().select("*", opts).eq() → terminal
    let selectCount = 0;
    mock.select.mockImplementation((...args: unknown[]) => {
      selectCount++;
      if (selectCount === 2 && args[0] === "*") {
        return {
          eq: jest.fn().mockResolvedValue({ count: 1, error: null }),
        };
      }
      return mock;
    });

    mockSupabaseServerClient.mockResolvedValue(
      mock as unknown as Awaited<ReturnType<typeof supabaseServerClient>>
    );

    const request = new NextRequest(
      "http://localhost/api/responses/resp-1/like",
      { method: "POST" }
    );
    const params = Promise.resolve({ responseId: "resp-1" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.liked).toBe(true);
    expect(data.like_count).toBe(1);
    expect(mock.insert).toHaveBeenCalled();
  });

  it("should handle duplicate like gracefully (23505 conflict)", async () => {
    const mock = createSupabaseMock();

    // 1. Response lookup
    mock.maybeSingle.mockResolvedValueOnce({
      data: { id: "resp-1", conversation_id: "conv-1" },
      error: null,
    });

    // 2. Insert returns 23505 unique violation
    mock.insert.mockReturnValueOnce({
      error: { code: "23505", message: "duplicate key" },
    });

    // 3. Count query
    let selectCount = 0;
    mock.select.mockImplementation((...args: unknown[]) => {
      selectCount++;
      if (selectCount === 2 && args[0] === "*") {
        return {
          eq: jest.fn().mockResolvedValue({ count: 1, error: null }),
        };
      }
      return mock;
    });

    mockSupabaseServerClient.mockResolvedValue(
      mock as unknown as Awaited<ReturnType<typeof supabaseServerClient>>
    );

    const request = new NextRequest(
      "http://localhost/api/responses/resp-1/like",
      { method: "POST" }
    );
    const params = Promise.resolve({ responseId: "resp-1" });
    const response = await POST(request, { params });
    const data = await response.json();

    // Should succeed — 23505 is handled gracefully
    expect(response.status).toBe(200);
    expect(data.liked).toBe(true);
  });

  it("should return 500 on non-duplicate insert error", async () => {
    const mock = createSupabaseMock();

    // 1. Response lookup
    mock.maybeSingle.mockResolvedValueOnce({
      data: { id: "resp-1", conversation_id: "conv-1" },
      error: null,
    });

    // 2. Insert fails with permission error
    mock.insert.mockReturnValueOnce({
      error: { code: "42501", message: "permission denied" },
    });

    mockSupabaseServerClient.mockResolvedValue(
      mock as unknown as Awaited<ReturnType<typeof supabaseServerClient>>
    );

    const request = new NextRequest(
      "http://localhost/api/responses/resp-1/like",
      { method: "POST" }
    );
    const params = Promise.resolve({ responseId: "resp-1" });
    const response = await POST(request, { params });

    expect(response.status).toBe(500);
  });
});

describe("DELETE /api/responses/[responseId]/like", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    });
  });

  it("should return 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = new NextRequest(
      "http://localhost/api/responses/resp-1/like",
      { method: "DELETE" }
    );
    const params = Promise.resolve({ responseId: "resp-1" });
    const response = await DELETE(request, { params });

    expect(response.status).toBe(401);
  });

  it("should successfully unlike a response", async () => {
    const mock = createSupabaseMock();

    // 1. Response lookup: from().select().eq().maybeSingle()
    mock.maybeSingle.mockResolvedValueOnce({
      data: { id: "resp-1", conversation_id: "conv-1" },
      error: null,
    });

    // 2. Delete: from().delete().eq().eq() → terminal
    mock.delete.mockReturnValueOnce({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    // 3. Count query: from().select("*", opts).eq() → terminal
    let selectCount = 0;
    mock.select.mockImplementation((...args: unknown[]) => {
      selectCount++;
      if (selectCount === 2 && args[0] === "*") {
        return {
          eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
        };
      }
      return mock;
    });

    mockSupabaseServerClient.mockResolvedValue(
      mock as unknown as Awaited<ReturnType<typeof supabaseServerClient>>
    );

    const request = new NextRequest(
      "http://localhost/api/responses/resp-1/like",
      { method: "DELETE" }
    );
    const params = Promise.resolve({ responseId: "resp-1" });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.liked).toBe(false);
    expect(data.like_count).toBe(0);
  });
});
