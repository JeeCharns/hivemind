/** @jest-environment node */
/**
 * Integration tests for POST /api/hives/[hiveId]/invite
 *
 * Tests hive invitation with authentication, authorization, and validation.
 */

import { POST } from "@/app/api/hives/[hiveId]/invite/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/hives/data/hiveResolver");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";

describe("POST /api/hives/[hiveId]/invite", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;
  const mockResolveHiveId = resolveHiveId as jest.MockedFunction<
    typeof resolveHiveId
  >;

  const mockSupabase = {
    from: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "admin@example.com" },
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);

    mockSupabaseServerClient.mockResolvedValue(
      mockSupabase as unknown as Awaited<
        ReturnType<typeof supabaseServerClient>
      >
    );

    mockResolveHiveId.mockResolvedValue("hive-123");
  });

  it("should reject unauthenticated user", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/hives/hive-123/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: ["test@example.com"] }),
    });

    const params = Promise.resolve({ hiveId: "hive-123" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should reject invalid email format", async () => {
    const request = new NextRequest("http://localhost/api/hives/hive-123/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: ["invalid-email"] }),
    });

    const params = Promise.resolve({ hiveId: "hive-123" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid email");
  });

  it("should reject more than 10 emails", async () => {
    const emails = Array.from({ length: 11 }, (_, i) => `user${i}@example.com`);

    const request = new NextRequest("http://localhost/api/hives/hive-123/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails }),
    });

    const params = Promise.resolve({ hiveId: "hive-123" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("should reject empty emails array", async () => {
    const request = new NextRequest("http://localhost/api/hives/hive-123/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: [] }),
    });

    const params = Promise.resolve({ hiveId: "hive-123" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("should reject non-existent hive", async () => {
    mockResolveHiveId.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/hives/non-existent/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: ["test@example.com"] }),
    });

    const params = Promise.resolve({ hiveId: "non-existent" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Hive not found");
  });

  it("should reject non-admin member", async () => {
    const mockSelect = jest.fn().mockReturnThis();
    const mockEq = jest.fn().mockReturnThis();
    const mockMaybeSingle = jest.fn().mockResolvedValue({
      data: { role: "member" },
    });

    mockSupabase.from.mockReturnValue({
      select: mockSelect,
    });
    mockSelect.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockReturnValueOnce({
      eq: jest.fn().mockReturnValue({
        maybeSingle: mockMaybeSingle,
      }),
    });

    const request = new NextRequest("http://localhost/api/hives/hive-123/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: ["test@example.com"] }),
    });

    const params = Promise.resolve({ hiveId: "hive-123" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("should reject non-member", async () => {
    const mockSelect = jest.fn().mockReturnThis();
    const mockEq = jest.fn().mockReturnThis();
    const mockMaybeSingle = jest.fn().mockResolvedValue({
      data: null,
    });

    mockSupabase.from.mockReturnValue({
      select: mockSelect,
    });
    mockSelect.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockReturnValueOnce({
      eq: jest.fn().mockReturnValue({
        maybeSingle: mockMaybeSingle,
      }),
    });

    const request = new NextRequest("http://localhost/api/hives/hive-123/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: ["test@example.com"] }),
    });

    const params = Promise.resolve({ hiveId: "hive-123" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("should create invites for admin", async () => {
    const mockSelect = jest.fn().mockReturnThis();
    const mockEq = jest.fn().mockReturnThis();
    const mockMaybeSingle = jest.fn().mockResolvedValue({
      data: { role: "admin" },
    });
    const mockInsert = jest.fn().mockResolvedValue({ error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "hive_members") {
        return {
          select: mockSelect,
        };
      }
      if (table === "hive_invites") {
        return {
          insert: mockInsert,
        };
      }
      return {};
    });

    mockSelect.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockReturnValueOnce({
      eq: jest.fn().mockReturnValue({
        maybeSingle: mockMaybeSingle,
      }),
    });

    const request = new NextRequest("http://localhost/api/hives/hive-123/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        emails: ["user1@example.com", "user2@example.com"],
      }),
    });

    const params = Promise.resolve({ hiveId: "hive-123" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe("Invites created");
    expect(data.count).toBe(2);

    expect(mockInsert).toHaveBeenCalledWith([
      {
        hive_id: "hive-123",
        email: "user1@example.com",
        status: "pending",
      },
      {
        hive_id: "hive-123",
        email: "user2@example.com",
        status: "pending",
      },
    ]);
  });
});
