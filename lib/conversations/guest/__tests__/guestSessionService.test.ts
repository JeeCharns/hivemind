/**
 * @jest-environment node
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createGuestSession,
  validateGuestSession,
  getGuestSessionCookie,
  clearGuestSessionCookie,
  GUEST_SESSION_COOKIE,
} from "../guestSessionService";

// ── Mock next/headers cookies() ──────────────────────────

const mockCookieStore = {
  set: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => Promise.resolve(mockCookieStore)),
}));

// ── Helpers ──────────────────────────────────────────────

function createMockSupabase(overrides: Record<string, jest.Mock> = {}) {
  const mock: Record<string, jest.Mock> = {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    eq: jest.fn(),
    gt: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    single: jest.fn(),
    ...overrides,
  };

  for (const key of Object.keys(mock)) {
    if (!["single", "maybeSingle"].includes(key)) {
      mock[key].mockReturnValue(mock);
    }
  }

  return mock as unknown as SupabaseClient & Record<string, jest.Mock>;
}

const SHARE_LINK_ID = "sl-001";
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

// ── Tests ────────────────────────────────────────────────

describe("guestSessionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createGuestSession", () => {
    it("creates session with guest_number = 1 when none exist", async () => {
      const created = {
        id: "gs-001",
        share_link_id: SHARE_LINK_ID,
        guest_number: 1,
        expires_at: FUTURE,
      };

      const supabase = createMockSupabase({
        single: jest
          .fn()
          // maxRow query: no existing sessions
          .mockResolvedValueOnce({ data: null, error: null })
          // insert query: returns new session
          .mockResolvedValueOnce({ data: created, error: null }),
      });

      const result = await createGuestSession(supabase, SHARE_LINK_ID, FUTURE);

      expect(result.id).toBe("gs-001");
      expect(result.guestNumber).toBe(1);
      expect(result.shareLinkId).toBe(SHARE_LINK_ID);

      // Cookie should be set
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        GUEST_SESSION_COOKIE,
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        })
      );
    });

    it("increments guest_number based on existing max", async () => {
      const created = {
        id: "gs-002",
        share_link_id: SHARE_LINK_ID,
        guest_number: 4,
        expires_at: FUTURE,
      };

      const supabase = createMockSupabase({
        single: jest
          .fn()
          .mockResolvedValueOnce({
            data: { guest_number: 3 },
            error: null,
          })
          .mockResolvedValueOnce({ data: created, error: null }),
      });

      const result = await createGuestSession(supabase, SHARE_LINK_ID, FUTURE);
      expect(result.guestNumber).toBe(4);
    });

    it("throws when insert fails", async () => {
      const supabase = createMockSupabase({
        single: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null })
          .mockResolvedValueOnce({
            data: null,
            error: { message: "insert failed" },
          }),
      });

      await expect(
        createGuestSession(supabase, SHARE_LINK_ID, FUTURE)
      ).rejects.toThrow("[createGuestSession] Failed");
    });
  });

  describe("validateGuestSession", () => {
    it("returns null when no cookie present", async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const supabase = createMockSupabase();
      const result = await validateGuestSession(supabase);

      expect(result).toBeNull();
    });

    it("returns validated session when cookie is valid", async () => {
      mockCookieStore.get.mockReturnValue({ value: "raw-session-token" });

      const sessionRow = {
        id: "gs-001",
        share_link_id: SHARE_LINK_ID,
        guest_number: 2,
        expires_at: FUTURE,
        conversation_share_links: {
          id: SHARE_LINK_ID,
          conversation_id: "conv-001",
          is_active: true,
          expires_at: FUTURE,
          conversations: {
            id: "conv-001",
            title: "Test Conversation",
            description: "A test",
            type: "open",
          },
        },
      };

      const supabase = createMockSupabase({
        single: jest
          .fn()
          .mockResolvedValueOnce({ data: sessionRow, error: null }),
      });

      const result = await validateGuestSession(supabase);

      expect(result).not.toBeNull();
      expect(result!.guestSessionId).toBe("gs-001");
      expect(result!.guestNumber).toBe(2);
      expect(result!.conversationId).toBe("conv-001");
      expect(result!.conversationTitle).toBe("Test Conversation");
    });

    it("returns null when share link is inactive", async () => {
      mockCookieStore.get.mockReturnValue({ value: "raw-session-token" });

      const sessionRow = {
        id: "gs-001",
        share_link_id: SHARE_LINK_ID,
        guest_number: 2,
        expires_at: FUTURE,
        conversation_share_links: {
          id: SHARE_LINK_ID,
          conversation_id: "conv-001",
          is_active: false, // revoked
          expires_at: FUTURE,
          conversations: {
            id: "conv-001",
            title: "Test",
            description: null,
            type: "open",
          },
        },
      };

      const supabase = createMockSupabase({
        single: jest
          .fn()
          .mockResolvedValueOnce({ data: sessionRow, error: null }),
      });

      const result = await validateGuestSession(supabase);
      expect(result).toBeNull();
    });

    it("returns null when share link has expired", async () => {
      mockCookieStore.get.mockReturnValue({ value: "raw-session-token" });

      const expired = new Date(Date.now() - 86_400_000).toISOString();
      const sessionRow = {
        id: "gs-001",
        share_link_id: SHARE_LINK_ID,
        guest_number: 2,
        expires_at: FUTURE,
        conversation_share_links: {
          id: SHARE_LINK_ID,
          conversation_id: "conv-001",
          is_active: true,
          expires_at: expired, // share link expired
          conversations: {
            id: "conv-001",
            title: "Test",
            description: null,
            type: "open",
          },
        },
      };

      const supabase = createMockSupabase({
        single: jest
          .fn()
          .mockResolvedValueOnce({ data: sessionRow, error: null }),
      });

      const result = await validateGuestSession(supabase);
      expect(result).toBeNull();
    });

    it("returns null when DB query fails", async () => {
      mockCookieStore.get.mockReturnValue({ value: "raw-session-token" });

      const supabase = createMockSupabase({
        single: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: { message: "err" } }),
      });

      const result = await validateGuestSession(supabase);
      expect(result).toBeNull();
    });
  });

  describe("getGuestSessionCookie", () => {
    it("returns cookie value when present", async () => {
      mockCookieStore.get.mockReturnValue({ value: "my-token" });
      const result = await getGuestSessionCookie();
      expect(result).toBe("my-token");
    });

    it("returns null when cookie is absent", async () => {
      mockCookieStore.get.mockReturnValue(undefined);
      const result = await getGuestSessionCookie();
      expect(result).toBeNull();
    });
  });

  describe("clearGuestSessionCookie", () => {
    it("deletes the guest session cookie", async () => {
      await clearGuestSessionCookie();
      expect(mockCookieStore.delete).toHaveBeenCalledWith(
        GUEST_SESSION_COOKIE
      );
    });
  });
});
