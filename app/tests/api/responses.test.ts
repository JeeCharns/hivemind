/**
 * Integration tests for conversation responses API
 *
 * Tests anonymity persistence and masking for POST/GET /api/conversations/[conversationId]/responses
 */

import { GET, POST } from "@/app/api/conversations/[conversationId]/responses/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";

describe("POST /api/conversations/[conversationId]/responses", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;

  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock authenticated session
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    } as any);

    // Create mock Supabase client
    mockSupabase = {
      from: jest.fn(() => mockSupabase),
      select: jest.fn(() => mockSupabase),
      insert: jest.fn(() => mockSupabase),
      eq: jest.fn(() => mockSupabase),
      in: jest.fn(() => mockSupabase),
      order: jest.fn(() => mockSupabase),
      maybeSingle: jest.fn(),
      single: jest.fn(),
    };

    mockSupabaseServerClient.mockResolvedValue(mockSupabase);
  });

  describe("anonymity persistence", () => {
    it("should persist is_anonymous=true when posting as anonymous", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
        error: null,
      });

      // Mock membership check - simplified for test
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { user_id: "user-123" },
        error: null,
      });

      let insertedData: any = null;

      // Mock response insert
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "resp-123",
          response_text: "Test response",
          tag: "need",
          created_at: "2025-01-01T00:00:00Z",
          user_id: "user-123",
          is_anonymous: true,
          profiles: {
            display_name: "John Doe",
            avatar_path: "/avatar.jpg",
          },
        },
        error: null,
      });

      mockSupabase.insert.mockImplementation((data: any) => {
        insertedData = data;
        return mockSupabase;
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/responses",
        {
          method: "POST",
          body: JSON.stringify({
            text: "Test response",
            tag: "need",
            anonymous: true,
          }),
        }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(insertedData).toMatchObject({
        is_anonymous: true,
      });
      expect(data.response.user.name).toBe("Anonymous");
      expect(data.response.user.avatarUrl).toBe(null);
    });

    it("should persist is_anonymous=false when posting with identity", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
        error: null,
      });

      // Mock membership check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { user_id: "user-123" },
        error: null,
      });

      let insertedData: any = null;

      // Mock response insert
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "resp-123",
          response_text: "Test response",
          tag: "need",
          created_at: "2025-01-01T00:00:00Z",
          user_id: "user-123",
          is_anonymous: false,
          profiles: {
            display_name: "John Doe",
            avatar_path: "/avatar.jpg",
          },
        },
        error: null,
      });

      mockSupabase.insert.mockImplementation((data: any) => {
        insertedData = data;
        return mockSupabase;
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/responses",
        {
          method: "POST",
          body: JSON.stringify({
            text: "Test response",
            tag: "need",
            anonymous: false,
          }),
        }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(insertedData).toMatchObject({
        is_anonymous: false,
      });
      expect(data.response.user.name).toBe("John Doe");
      expect(data.response.user.avatarUrl).toBe("/avatar.jpg");
    });

    it("should default to is_anonymous=false when anonymous field not provided", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
        error: null,
      });

      // Mock membership check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { user_id: "user-123" },
        error: null,
      });

      let insertedData: any = null;

      // Mock response insert
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "resp-123",
          response_text: "Test response",
          tag: "need",
          created_at: "2025-01-01T00:00:00Z",
          user_id: "user-123",
          is_anonymous: false,
          profiles: {
            display_name: "John Doe",
            avatar_path: "/avatar.jpg",
          },
        },
        error: null,
      });

      mockSupabase.insert.mockImplementation((data: any) => {
        insertedData = data;
        return mockSupabase;
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/responses",
        {
          method: "POST",
          body: JSON.stringify({
            text: "Test response",
            tag: "need",
          }),
        }
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      expect(insertedData).toMatchObject({
        is_anonymous: false,
      });
    });
  });
});

describe("GET /api/conversations/[conversationId]/responses", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;

  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock authenticated session
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    } as any);

    // Create mock Supabase client
    mockSupabase = {
      from: jest.fn(() => mockSupabase),
      select: jest.fn(() => mockSupabase),
      eq: jest.fn(() => mockSupabase),
      in: jest.fn(() => mockSupabase),
      order: jest.fn(() => mockSupabase),
      maybeSingle: jest.fn(),
    };

    mockSupabaseServerClient.mockResolvedValue(mockSupabase);
  });

  describe("identity masking", () => {
    it("should mask identity for anonymous responses", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
        error: null,
      });

      // Mock membership check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { user_id: "user-123" },
        error: null,
      });

      // Mock responses fetch
      mockSupabase.order.mockResolvedValueOnce({
        data: [
          {
            id: "resp-1",
            response_text: "Anonymous response",
            tag: "need",
            created_at: "2025-01-01T00:00:00Z",
            user_id: "user-456",
            is_anonymous: true,
            profiles: {
              display_name: "Jane Doe",
              avatar_path: "/jane.jpg",
            },
          },
          {
            id: "resp-2",
            response_text: "Public response",
            tag: "data",
            created_at: "2025-01-01T00:01:00Z",
            user_id: "user-789",
            is_anonymous: false,
            profiles: {
              display_name: "Bob Smith",
              avatar_path: "/bob.jpg",
            },
          },
        ],
        error: null,
      });

      // Mock likes fetch
      mockSupabase.in.mockResolvedValueOnce({
        data: [],
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/responses"
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.responses).toHaveLength(2);

      // Anonymous response should have masked identity
      expect(data.responses[0].user.name).toBe("Anonymous");
      expect(data.responses[0].user.avatarUrl).toBe(null);

      // Non-anonymous response should show identity
      expect(data.responses[1].user.name).toBe("Bob Smith");
      expect(data.responses[1].user.avatarUrl).toBe("/bob.jpg");
    });

    it("should handle responses without profiles gracefully", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
        error: null,
      });

      // Mock membership check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { user_id: "user-123" },
        error: null,
      });

      // Mock responses fetch with missing profile
      mockSupabase.order.mockResolvedValueOnce({
        data: [
          {
            id: "resp-1",
            response_text: "Response without profile",
            tag: "need",
            created_at: "2025-01-01T00:00:00Z",
            user_id: "user-456",
            is_anonymous: false,
            profiles: null,
          },
        ],
        error: null,
      });

      // Mock likes fetch
      mockSupabase.in.mockResolvedValueOnce({
        data: [],
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/responses"
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.responses[0].user.name).toBe("Member");
      expect(data.responses[0].user.avatarUrl).toBe(null);
    });

    it("should default to non-anonymous when is_anonymous field is missing", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
        error: null,
      });

      // Mock membership check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { user_id: "user-123" },
        error: null,
      });

      // Mock responses fetch without is_anonymous field (legacy data)
      mockSupabase.order.mockResolvedValueOnce({
        data: [
          {
            id: "resp-1",
            response_text: "Legacy response",
            tag: "need",
            created_at: "2025-01-01T00:00:00Z",
            user_id: "user-456",
            // is_anonymous field missing
            profiles: {
              display_name: "Jane Doe",
              avatar_path: "/jane.jpg",
            },
          },
        ],
        error: null,
      });

      // Mock likes fetch
      mockSupabase.in.mockResolvedValueOnce({
        data: [],
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/responses"
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should default to showing identity when is_anonymous is missing
      expect(data.responses[0].user.name).toBe("Jane Doe");
      expect(data.responses[0].user.avatarUrl).toBe("/jane.jpg");
    });
  });
});
