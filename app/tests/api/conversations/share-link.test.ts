/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/conversations/server/requireHiveMember");
jest.mock("@/lib/conversations/guest/conversationShareLinkService");

import { NextRequest } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import {
  createShareLink,
  getShareLink,
  revokeShareLink,
  guestUrl,
} from "@/lib/conversations/guest/conversationShareLinkService";
import { POST, GET, DELETE } from "@/app/api/conversations/[conversationId]/share-link/route";

// ── Mocks ────────────────────────────────────────────────

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
  typeof supabaseServerClient
>;
const mockRequireHiveMember = requireHiveMember as jest.MockedFunction<
  typeof requireHiveMember
>;
const mockCreateShareLink = createShareLink as jest.MockedFunction<
  typeof createShareLink
>;
const mockGetShareLink = getShareLink as jest.MockedFunction<
  typeof getShareLink
>;
const mockRevokeShareLink = revokeShareLink as jest.MockedFunction<
  typeof revokeShareLink
>;
const mockGuestUrl = guestUrl as jest.MockedFunction<typeof guestUrl>;

// Supabase mock with chainable from().select().eq().single()
let mockSupabase: Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();

  mockSupabase = {
    from: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn(),
  };
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockSupabaseServerClient.mockReturnValue(mockSupabase as any);

  mockGetServerSession.mockResolvedValue({
    user: { id: "user-123", email: "test@example.com" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  mockRequireHiveMember.mockResolvedValue(undefined);

  mockGuestUrl.mockReturnValue("https://app.example.com/respond/test-token");
});

const params = Promise.resolve({ conversationId: "conv-001" });

// ── Helpers ──────────────────────────────────────────────

function createRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/conversations/conv-001/share-link", {
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
    headers: body ? { "Content-Type": "application/json" } : {},
  });
}

// ── Tests ────────────────────────────────────────────────

describe("share-link route", () => {
  describe("POST", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const res = await POST(createRequest({ expiresIn: "7d" }), { params });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorised");
    });

    it("returns 404 when conversation not found", async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: null });

      const res = await POST(createRequest({ expiresIn: "7d" }), { params });
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid body", async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: "conv-001", hive_id: "hive-001" },
        error: null,
      });

      const res = await POST(createRequest({ expiresIn: "99d" }), { params });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("creates and returns share link", async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: "conv-001", hive_id: "hive-001" },
        error: null,
      });

      mockCreateShareLink.mockResolvedValue({
        id: "sl-001",
        conversationId: "conv-001",
        token: "test-token",
        expiresAt: "2025-12-31T00:00:00Z",
        isActive: true,
        createdBy: "user-123",
        createdAt: "2025-01-01T00:00:00Z",
      });

      const res = await POST(createRequest({ expiresIn: "7d" }), { params });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toBe("https://app.example.com/respond/test-token");
      expect(body.token).toBe("test-token");
    });
  });

  describe("GET", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const res = await GET(createRequest(), { params });
      expect(res.status).toBe(401);
    });

    it("returns null link when none active", async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: "conv-001", hive_id: "hive-001" },
        error: null,
      });
      mockGetShareLink.mockResolvedValue(null);

      const res = await GET(createRequest(), { params });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.link).toBeNull();
    });

    it("returns the active share link", async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: "conv-001", hive_id: "hive-001" },
        error: null,
      });
      mockGetShareLink.mockResolvedValue({
        id: "sl-001",
        conversationId: "conv-001",
        token: "test-token",
        expiresAt: "2025-12-31T00:00:00Z",
        isActive: true,
        createdBy: "user-123",
        createdAt: "2025-01-01T00:00:00Z",
      });

      const res = await GET(createRequest(), { params });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toBe("https://app.example.com/respond/test-token");
      expect(body.isActive).toBe(true);
    });
  });

  describe("DELETE", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const req = new NextRequest(
        "http://localhost:3000/api/conversations/conv-001/share-link",
        { method: "DELETE" }
      );
      const res = await DELETE(req, { params });
      expect(res.status).toBe(401);
    });

    it("revokes the share link", async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: "conv-001", hive_id: "hive-001" },
        error: null,
      });
      mockRevokeShareLink.mockResolvedValue(true);

      const req = new NextRequest(
        "http://localhost:3000/api/conversations/conv-001/share-link",
        { method: "DELETE" }
      );
      const res = await DELETE(req, { params });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.revoked).toBe(true);
    });
  });
});
