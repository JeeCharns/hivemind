/** @jest-environment node */
/**
 * Integration tests for conversation responses API
 *
 * Tests anonymity persistence and masking for POST/GET /api/conversations/[conversationId]/responses
 */

import {
  GET,
  POST,
} from "@/app/api/conversations/[conversationId]/responses/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/supabase/adminClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/conversations/server/requireHiveMember");
jest.mock("@/lib/storage/server/getAvatarUrl", () => ({
  getAvatarUrl: jest
    .fn()
    .mockResolvedValue("https://signed.example.com/avatar"),
}));

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";

type SupabaseMock = {
  from: jest.Mock;
  select: jest.Mock;
  insert: jest.Mock;
  eq: jest.Mock;
  is: jest.Mock;
  in: jest.Mock;
  order: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
};

describe("POST /api/conversations/[conversationId]/responses", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockRequireHiveMember = requireHiveMember as jest.MockedFunction<
    typeof requireHiveMember
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;

  let mockSupabase: SupabaseMock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock authenticated session
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    });

    mockRequireHiveMember.mockResolvedValue(undefined);

    // Create mock Supabase client
    mockSupabase = {
      from: jest.fn(() => mockSupabase),
      select: jest.fn(() => mockSupabase),
      insert: jest.fn(() => mockSupabase),
      eq: jest.fn(() => mockSupabase),
      is: jest.fn(() => mockSupabase),
      in: jest.fn(() => mockSupabase),
      order: jest.fn(() => mockSupabase),
      maybeSingle: jest.fn(),
      single: jest.fn(),
    };

    mockSupabaseServerClient.mockResolvedValue(
      mockSupabase as unknown as Awaited<
        ReturnType<typeof supabaseServerClient>
      >
    );
  });

  describe("anonymity persistence", () => {
    it("should persist is_anonymous=true when posting as anonymous", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
        error: null,
      });

      let insertedData: Record<string, unknown> | null = null;

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

      mockSupabase.insert.mockImplementation(
        (data: Record<string, unknown>) => {
          insertedData = data;
          return mockSupabase;
        }
      );

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

      let insertedData: Record<string, unknown> | null = null;

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

      mockSupabase.insert.mockImplementation(
        (data: Record<string, unknown>) => {
          insertedData = data;
          return mockSupabase;
        }
      );

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
      expect(data.response.user.avatarUrl).toBe(
        "https://signed.example.com/avatar"
      );
    });

    it("should default to is_anonymous=false when anonymous field not provided", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
        error: null,
      });

      let insertedData: Record<string, unknown> | null = null;

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

      mockSupabase.insert.mockImplementation(
        (data: Record<string, unknown>) => {
          insertedData = data;
          return mockSupabase;
        }
      );

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
  const mockRequireHiveMember = requireHiveMember as jest.MockedFunction<
    typeof requireHiveMember
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;
  const mockSupabaseAdminClient = supabaseAdminClient as jest.MockedFunction<
    typeof supabaseAdminClient
  >;

  let mockSupabase: SupabaseMock;
  let mockAdminSupabase: SupabaseMock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock authenticated session
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    });

    mockRequireHiveMember.mockResolvedValue(undefined);

    // Create mock Supabase client
    mockSupabase = {
      from: jest.fn(() => mockSupabase),
      select: jest.fn(() => mockSupabase),
      insert: jest.fn(() => mockSupabase),
      eq: jest.fn(() => mockSupabase),
      is: jest.fn(() => mockSupabase),
      in: jest.fn(() => mockSupabase),
      order: jest.fn(() => mockSupabase),
      maybeSingle: jest.fn(),
      single: jest.fn(),
    };

    // Create mock admin Supabase client (for guest_sessions lookup)
    mockAdminSupabase = {
      from: jest.fn(() => mockAdminSupabase),
      select: jest.fn(() => mockAdminSupabase),
      insert: jest.fn(() => mockAdminSupabase),
      eq: jest.fn(() => mockAdminSupabase),
      in: jest.fn(() => mockAdminSupabase),
      order: jest.fn(() => mockAdminSupabase),
      maybeSingle: jest.fn(),
      single: jest.fn(),
    };

    mockSupabaseServerClient.mockResolvedValue(
      mockSupabase as unknown as Awaited<
        ReturnType<typeof supabaseServerClient>
      >
    );

    mockSupabaseAdminClient.mockReturnValue(
      mockAdminSupabase as unknown as ReturnType<typeof supabaseAdminClient>
    );
  });

  describe("identity masking", () => {
    it("should mask identity for anonymous responses", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
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
      expect(data.responses[1].user.avatarUrl).toBe(
        "https://signed.example.com/avatar"
      );
    });

    it("should handle responses without profiles gracefully", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
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
      expect(data.responses[0].user.avatarUrl).toBe(
        "https://signed.example.com/avatar"
      );
    });

    it("should display 'Guest N' for guest responses via admin client lookup", async () => {
      // Mock conversation check
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { hive_id: "hive-456" },
        error: null,
      });

      // Mock responses fetch (guest responses have guest_session_id set)
      mockSupabase.order.mockResolvedValueOnce({
        data: [
          {
            id: "resp-1",
            response_text: "Guest response",
            tag: "need",
            created_at: "2025-01-01T00:00:00Z",
            user_id: "c8661a31-3493-4c0f-9f14-0c08fcc68696",
            is_anonymous: true,
            guest_session_id: "guest-session-abc",
            profiles: null,
          },
          {
            id: "resp-2",
            response_text: "Another guest response",
            tag: "data",
            created_at: "2025-01-01T00:01:00Z",
            user_id: "c8661a31-3493-4c0f-9f14-0c08fcc68696",
            is_anonymous: true,
            guest_session_id: "guest-session-def",
            profiles: null,
          },
        ],
        error: null,
      });

      // Mock likes fetch
      mockSupabase.in.mockResolvedValueOnce({
        data: [],
      });

      // Mock admin client guest_sessions lookup
      mockAdminSupabase.in.mockResolvedValueOnce({
        data: [
          { id: "guest-session-abc", guest_number: 1 },
          { id: "guest-session-def", guest_number: 2 },
        ],
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/responses"
      );

      const params = Promise.resolve({ conversationId: "conv-123" });
      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.responses).toHaveLength(2);

      // Guest responses should show "Guest 1" / "Guest 2" not "Anonymous"
      expect(data.responses[0].user.name).toBe("Guest 1");
      expect(data.responses[0].user.avatarUrl).toBe(null);

      expect(data.responses[1].user.name).toBe("Guest 2");
      expect(data.responses[1].user.avatarUrl).toBe(null);

      // Verify admin client was used for guest_sessions lookup
      expect(mockAdminSupabase.from).toHaveBeenCalledWith("guest_sessions");
    });
  });
});
