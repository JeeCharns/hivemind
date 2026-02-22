/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/adminClient");
jest.mock("@/lib/conversations/guest/conversationShareLinkService");
jest.mock("@/lib/conversations/guest/guestSessionService");

import { NextRequest } from "next/server";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { resolveShareToken } from "@/lib/conversations/guest/conversationShareLinkService";
import {
  createGuestSession,
  validateGuestSession,
} from "@/lib/conversations/guest/guestSessionService";
import { GET } from "@/app/api/guest/[token]/session/route";

// ── Mocks ────────────────────────────────────────────────

const mockAdminClient = supabaseAdminClient as jest.MockedFunction<
  typeof supabaseAdminClient
>;
const mockResolveShareToken = resolveShareToken as jest.MockedFunction<
  typeof resolveShareToken
>;
const mockValidateGuestSession = validateGuestSession as jest.MockedFunction<
  typeof validateGuestSession
>;
const mockCreateGuestSession = createGuestSession as jest.MockedFunction<
  typeof createGuestSession
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeAdmin = {} as any;

const VALID_TOKEN = "a".repeat(43); // 32+ chars base64url

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminClient.mockReturnValue(fakeAdmin);
});

function createRequest(): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/guest/${VALID_TOKEN}/session`
  );
}

// ── Tests ────────────────────────────────────────────────

describe("GET /api/guest/[token]/session", () => {
  it("returns 400 for invalid token format", async () => {
    const params = Promise.resolve({ token: "short" });
    const res = await GET(createRequest(), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_TOKEN");
  });

  it("resumes existing session when cookie is valid", async () => {
    const params = Promise.resolve({ token: VALID_TOKEN });

    mockValidateGuestSession.mockResolvedValue({
      guestSessionId: "gs-001",
      guestNumber: 2,
      shareLinkId: "sl-001",
      conversationId: "conv-001",
      conversationTitle: "Workshop Q1",
      conversationDescription: "Quarterly discussion",
      conversationType: "understand",
    });

    const res = await GET(createRequest(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.guestNumber).toBe(2);
    expect(body.session.conversationId).toBe("conv-001");
    expect(body.session.tabs).toEqual(["listen", "understand", "result"]);
    // Should not create a new session
    expect(mockCreateGuestSession).not.toHaveBeenCalled();
  });

  it("returns 404 when token is expired/revoked", async () => {
    const params = Promise.resolve({ token: VALID_TOKEN });

    mockValidateGuestSession.mockResolvedValue(null);
    mockResolveShareToken.mockResolvedValue(null);

    const res = await GET(createRequest(), { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("LINK_NOT_FOUND");
  });

  it("creates new guest session for first-time visitor", async () => {
    const params = Promise.resolve({ token: VALID_TOKEN });

    mockValidateGuestSession.mockResolvedValue(null);
    mockResolveShareToken.mockResolvedValue({
      shareLink: {
        id: "sl-001",
        conversationId: "conv-001",
        token: VALID_TOKEN,
        expiresAt: "2025-12-31T00:00:00Z",
        isActive: true,
        createdBy: "user-123",
        createdAt: "2025-01-01T00:00:00Z",
      },
      conversationId: "conv-001",
      conversationTitle: "Workshop",
      conversationDescription: null,
      conversationType: "open",
    });

    mockCreateGuestSession.mockResolvedValue({
      id: "gs-002",
      shareLinkId: "sl-001",
      guestNumber: 1,
      expiresAt: "2025-12-31T00:00:00Z",
    });

    const res = await GET(createRequest(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.guestNumber).toBe(1);
    expect(body.session.conversationTitle).toBe("Workshop");
    expect(mockCreateGuestSession).toHaveBeenCalledWith(
      fakeAdmin,
      "sl-001",
      "2025-12-31T00:00:00Z"
    );
  });
});
