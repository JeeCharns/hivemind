/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/adminClient");
jest.mock("@/lib/conversations/guest/guestSessionService");
jest.mock("@/lib/conversations/guest/conversationShareLinkService");

import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { validateGuestSession } from "@/lib/conversations/guest/guestSessionService";
import { resolveShareToken } from "@/lib/conversations/guest/conversationShareLinkService";
import { requireGuestSession } from "../requireGuestSession";
import type { ValidatedGuestSession } from "../guestSessionService";

const mockAdminClient = supabaseAdminClient as jest.MockedFunction<
  typeof supabaseAdminClient
>;
const mockValidateGuestSession = validateGuestSession as jest.MockedFunction<
  typeof validateGuestSession
>;
const mockResolveShareToken = resolveShareToken as jest.MockedFunction<
  typeof resolveShareToken
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeAdmin = {} as any;

const validSession: ValidatedGuestSession = {
  guestSessionId: "gs-001",
  guestNumber: 1,
  shareLinkId: "sl-001",
  conversationId: "conv-001",
  conversationTitle: "Test",
  conversationDescription: null,
  conversationType: "open",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validResolved: any = {
  shareLink: { id: "sl-001", token: "abc" },
  conversationId: "conv-001",
  conversationTitle: "Test",
  conversationDescription: null,
  conversationType: "open",
};

describe("requireGuestSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminClient.mockReturnValue(fakeAdmin);
  });

  it("rejects invalid token format", async () => {
    // Token too short
    const result = await requireGuestSession("abc");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.error.json();
      expect(body.code).toBe("INVALID_TOKEN");
    }
  });

  it("rejects when no guest session cookie", async () => {
    const validToken = "a".repeat(43); // 32+ base64url chars
    mockValidateGuestSession.mockResolvedValue(null);

    const result = await requireGuestSession(validToken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.error.json();
      expect(body.code).toBe("SESSION_INVALID");
    }
  });

  it("rejects when share link not found", async () => {
    const validToken = "a".repeat(43);
    mockValidateGuestSession.mockResolvedValue(validSession);
    mockResolveShareToken.mockResolvedValue(null);

    const result = await requireGuestSession(validToken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.error.json();
      expect(body.code).toBe("LINK_NOT_FOUND");
    }
  });

  it("rejects when conversation IDs do not match (scope mismatch)", async () => {
    const validToken = "a".repeat(43);
    mockValidateGuestSession.mockResolvedValue({
      ...validSession,
      conversationId: "different-conv",
    });
    mockResolveShareToken.mockResolvedValue(validResolved);

    const result = await requireGuestSession(validToken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.error.json();
      expect(body.code).toBe("SCOPE_MISMATCH");
    }
  });

  it("returns context on success", async () => {
    const validToken = "a".repeat(43);
    mockValidateGuestSession.mockResolvedValue(validSession);
    mockResolveShareToken.mockResolvedValue(validResolved);

    const result = await requireGuestSession(validToken);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.conversationId).toBe("conv-001");
      expect(result.ctx.session.guestNumber).toBe(1);
      expect(result.ctx.adminClient).toBe(fakeAdmin);
    }
  });
});
