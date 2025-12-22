/** @jest-environment node */
/**
 * Integration tests for DELETE /api/conversations/[conversationId]
 *
 * Tests conversation deletion with cascade cleanup
 */

import { DELETE } from "@/app/api/conversations/[conversationId]/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/conversations/server/requireHiveAdmin");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { requireHiveAdmin } from "@/lib/conversations/server/requireHiveAdmin";

type SupabaseMock = {
  from: jest.Mock;
  select: jest.Mock;
  eq: jest.Mock;
  in: jest.Mock;
  delete: jest.Mock;
  maybeSingle: jest.Mock;
};

describe("DELETE /api/conversations/[conversationId]", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockRequireHiveAdmin = requireHiveAdmin as jest.MockedFunction<
    typeof requireHiveAdmin
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;

  let mockSupabase: SupabaseMock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    });

    mockRequireHiveAdmin.mockResolvedValue(undefined);

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    };

    mockSupabaseServerClient.mockResolvedValue(
      mockSupabase as unknown as Awaited<ReturnType<typeof supabaseServerClient>>
    );
  });

  it("should delete conversation and all related data", async () => {
    // Mock conversation fetch chain
    const selectChain = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValueOnce({
        data: { hive_id: "hive-123" },
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue(selectChain),
    });

    // Mock responses fetch for response_likes cleanup
    const responsesSelectChain = {
      eq: jest.fn().mockResolvedValueOnce({
        data: [{ id: 1 }, { id: 2 }],
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue(responsesSelectChain),
    });

    // Mock response_likes delete
    const responseLikesDeleteChain = {
      in: jest.fn().mockResolvedValue({ error: null }),
    };
    mockSupabase.from.mockReturnValueOnce({
      delete: jest.fn().mockReturnValue(responseLikesDeleteChain),
    });

    // Mock all other table deletes (7 tables)
    for (let i = 0; i < 7; i++) {
      const deleteChain = {
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      mockSupabase.from.mockReturnValueOnce({
        delete: jest.fn().mockReturnValue(deleteChain),
      });
    }

    // Mock final conversation delete
    const conversationDeleteChain = {
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    mockSupabase.from.mockReturnValueOnce({
      delete: jest.fn().mockReturnValue(conversationDeleteChain),
    });

    const request = new NextRequest(
      "http://localhost/api/conversations/conv-123",
      { method: "DELETE" }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ conversationId: "conv-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe("Deleted");
    expect(mockRequireHiveAdmin).toHaveBeenCalledWith(
      mockSupabase,
      "user-123",
      "hive-123"
    );
  });

  it("should return 401 if not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/conversations/conv-123",
      { method: "DELETE" }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ conversationId: "conv-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized: Not authenticated");
  });

  it("should return 404 if conversation not found", async () => {
    const selectChain = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValueOnce({
        data: null,
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue(selectChain),
    });

    const request = new NextRequest(
      "http://localhost/api/conversations/conv-123",
      { method: "DELETE" }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ conversationId: "conv-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Conversation not found");
  });

  it("should return 403 if user is not hive admin", async () => {
    const selectChain = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValueOnce({
        data: { hive_id: "hive-123" },
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue(selectChain),
    });

    mockRequireHiveAdmin.mockRejectedValueOnce(
      new Error("Unauthorized: Admin access required")
    );

    const request = new NextRequest(
      "http://localhost/api/conversations/conv-123",
      { method: "DELETE" }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ conversationId: "conv-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Unauthorized: Admin access required");
  });

  it("should handle deletion errors gracefully", async () => {
    const selectChain = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValueOnce({
        data: { hive_id: "hive-123" },
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue(selectChain),
    });

    // Mock responses fetch
    const responsesSelectChain = {
      eq: jest.fn().mockResolvedValueOnce({
        data: [],
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue(responsesSelectChain),
    });

    // Mock delete error on first table
    const deleteChain = {
      eq: jest.fn().mockResolvedValueOnce({
        error: { message: "Database error" },
      }),
    };
    mockSupabase.from.mockReturnValueOnce({
      delete: jest.fn().mockReturnValue(deleteChain),
    });

    const request = new NextRequest(
      "http://localhost/api/conversations/conv-123",
      { method: "DELETE" }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ conversationId: "conv-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Failed to delete");
  });
});
