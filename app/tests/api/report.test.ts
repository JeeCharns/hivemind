/** @jest-environment node */
/**
 * Integration tests for conversation report API
 *
 * Tests report generation gating and threshold enforcement for POST /api/conversations/[conversationId]/report
 */

import { POST } from "@/app/api/conversations/[conversationId]/report/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/conversations/server/requireHiveMember");
jest.mock("@/lib/ai/anthropic");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { getAnthropicClient } from "@/lib/ai/anthropic";

type SupabaseChain = {
  from: jest.Mock;
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
};

describe("POST /api/conversations/[conversationId]/report", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockRequireHiveMember = requireHiveMember as jest.MockedFunction<
    typeof requireHiveMember
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;
  const mockGetAnthropicClient = getAnthropicClient as jest.MockedFunction<
    typeof getAnthropicClient
  >;

  let mockSupabase: SupabaseChain;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock authenticated session
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "admin@example.com" },
    });

    // Mock admin check (default: passes)
    mockRequireHiveMember.mockResolvedValue(undefined);

    // Create mock Supabase client with proper chaining
    const createMockChain = (): SupabaseChain => {
      const chain: SupabaseChain = {
        from: jest.fn(() => chain),
        select: jest.fn(() => chain),
        insert: jest.fn(() => chain),
        update: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        maybeSingle: jest.fn(),
        single: jest.fn(),
      };
      return chain;
    };

    mockSupabase = createMockChain();
    mockSupabaseServerClient.mockResolvedValue(
      mockSupabase as unknown as Awaited<ReturnType<typeof supabaseServerClient>>
    );

    // Mock Anthropic client
    mockGetAnthropicClient.mockReturnValue({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: "<h1>Executive Summary</h1><p>Test report content</p>",
            },
          ],
        }),
      },
    } as unknown as ReturnType<typeof getAnthropicClient>);
  });

  describe("authentication and authorization", () => {
    it("should return 401 when no session", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/report",
        { method: "POST" }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toContain("Unauthorized");
    });

    it("should return 403 when not a hive member", async () => {
      mockRequireHiveMember.mockRejectedValueOnce(
        new Error("Not a hive member")
      );

      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "conv-123",
          hive_id: "hive-456",
          type: "understand",
          phase: "understand_open",
          analysis_status: "ready",
          title: "Test Conversation",
        },
        error: null,
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/report",
        { method: "POST" }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain("Must be a hive member");
    });
  });

  describe("conversation validation", () => {
    it("should return 404 when conversation not found", async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/report",
        { method: "POST" }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain("Conversation not found");
    });

    it("should return 409 when conversation type is not 'understand'", async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "conv-123",
          hive_id: "hive-456",
          type: "other",
          phase: "open",
          analysis_status: "ready",
          title: "Test Conversation",
        },
        error: null,
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/report",
        { method: "POST" }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toContain("'understand' conversations");
    });

    it("should return 409 when analysis is not ready", async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "conv-123",
          hive_id: "hive-456",
          type: "understand",
          phase: "understand_open",
          analysis_status: "embedding",
          title: "Test Conversation",
        },
        error: null,
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/report",
        { method: "POST" }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toContain("Analysis must be ready");
    });
  });

  describe("response count threshold (20)", () => {
    it("should return 409 when response count is 19", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "conv-123",
          hive_id: "hive-456",
          type: "understand",
          phase: "understand_open",
          analysis_status: "ready",
          title: "Test Conversation",
        },
        error: null,
      });

      // Mock response count (19 responses)
      mockSupabase.eq
        .mockImplementationOnce(() => mockSupabase)
        .mockResolvedValueOnce({
          count: 19,
          error: null,
        });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/report",
        { method: "POST" }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toContain("20");
    });

    it("should allow report generation with exactly 20 responses", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "conv-123",
          hive_id: "hive-456",
          type: "understand",
          phase: "understand_open",
          analysis_status: "ready",
          title: "Test Conversation",
        },
        error: null,
      });

      // Mock response count (20 responses)
      mockSupabase.eq
        .mockImplementationOnce(() => mockSupabase)
        .mockResolvedValueOnce({
          count: 20,
          error: null,
        });

      // Mock latest version check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Mock report insert
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          version: 1,
          html: "<h1>Executive Summary</h1>",
          created_at: "2025-01-01T00:00:00Z",
        },
        error: null,
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/report",
        { method: "POST" }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.report).toBeDefined();
      expect(data.version).toBe(1);
    });

    it("should allow report generation with 25 responses", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "conv-123",
          hive_id: "hive-456",
          type: "understand",
          phase: "report_open",
          analysis_status: "ready",
          title: "Test Conversation",
        },
        error: null,
      });

      // Mock response count (25 responses)
      mockSupabase.eq
        .mockImplementationOnce(() => mockSupabase)
        .mockResolvedValueOnce({
          count: 25,
          error: null,
        });

      // Mock latest version check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Mock report insert
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          version: 1,
          html: "<h1>Executive Summary</h1>",
          created_at: "2025-01-01T00:00:00Z",
        },
        error: null,
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/report",
        { method: "POST" }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.report).toBeDefined();
      expect(data.version).toBe(1);
    });
  });
});
