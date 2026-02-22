/**
 * @jest-environment node
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createShareLink,
  getShareLink,
  revokeShareLink,
  resolveShareToken,
  guestUrl,
} from "../conversationShareLinkService";

// ── Helpers ──────────────────────────────────────────────

/** Chainable mock Supabase client with terminal methods. */
function createMockSupabase(overrides: Record<string, jest.Mock> = {}) {
  const mock: Record<string, jest.Mock> = {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    eq: jest.fn(),
    gt: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    single: jest.fn(),
    ...overrides,
  };

  // Make every non-terminal method chain back to mock
  for (const key of Object.keys(mock)) {
    if (!["single", "maybeSingle"].includes(key)) {
      mock[key].mockReturnValue(mock);
    }
  }

  return mock as unknown as SupabaseClient & Record<string, jest.Mock>;
}

const CONV_ID = "conv-001";
const USER_ID = "user-001";

const activeRow = {
  id: "link-001",
  conversation_id: CONV_ID,
  token: "existing-token-abc",
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  is_active: true,
  created_by: USER_ID,
  created_at: new Date().toISOString(),
};

// ── Tests ────────────────────────────────────────────────

describe("conversationShareLinkService", () => {
  describe("guestUrl", () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      process.env = { ...OLD_ENV };
    });

    afterAll(() => {
      process.env = OLD_ENV;
    });

    it("uses NEXT_PUBLIC_SITE_URL when set", () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
      expect(guestUrl("abc")).toBe("https://app.example.com/respond/abc");
    });

    it("falls back to VERCEL_URL with https prefix", () => {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      process.env.VERCEL_URL = "my-app.vercel.app";
      expect(guestUrl("abc")).toBe("https://my-app.vercel.app/respond/abc");
    });

    it("falls back to localhost when no env set", () => {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      delete process.env.VERCEL_URL;
      expect(guestUrl("abc")).toBe("http://localhost:3000/respond/abc");
    });
  });

  describe("createShareLink", () => {
    it("returns existing link when one is active and not expired", async () => {
      const supabase = createMockSupabase({
        single: jest.fn().mockResolvedValueOnce({
          data: activeRow,
          error: null,
        }),
      });

      const result = await createShareLink(supabase, CONV_ID, USER_ID, "7d");

      expect(result.id).toBe("link-001");
      expect(result.conversationId).toBe(CONV_ID);
      expect(result.token).toBe("existing-token-abc");
      expect(result.isActive).toBe(true);
      // insert should never have been called
      expect(supabase.insert).not.toHaveBeenCalled();
    });

    it("creates a new link when no active link exists", async () => {
      const newRow = { ...activeRow, id: "link-002", token: "new-generated" };

      const supabase = createMockSupabase({
        single: jest
          .fn()
          // First call: existing check returns null
          .mockResolvedValueOnce({ data: null, error: null })
          // Second call: insert returns new row
          .mockResolvedValueOnce({ data: newRow, error: null }),
      });

      const result = await createShareLink(supabase, CONV_ID, USER_ID, "7d");

      expect(result.id).toBe("link-002");
      expect((supabase as unknown as Record<string, jest.Mock>).insert).toHaveBeenCalled();
    });

    it("throws when insert fails", async () => {
      const supabase = createMockSupabase({
        single: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null })
          .mockResolvedValueOnce({
            data: null,
            error: { message: "duplicate" },
          }),
      });

      await expect(
        createShareLink(supabase, CONV_ID, USER_ID, "7d")
      ).rejects.toThrow("[createShareLink] Failed to create share link");
    });
  });

  describe("getShareLink", () => {
    it("returns the active share link", async () => {
      const supabase = createMockSupabase({
        single: jest
          .fn()
          .mockResolvedValueOnce({ data: activeRow, error: null }),
      });

      const result = await getShareLink(supabase, CONV_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("link-001");
      expect(result!.isActive).toBe(true);
    });

    it("returns null when no active link", async () => {
      const supabase = createMockSupabase({
        single: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      });

      const result = await getShareLink(supabase, CONV_ID);
      expect(result).toBeNull();
    });
  });

  describe("revokeShareLink", () => {
    /**
     * revokeShareLink chains: from → update → eq → eq
     * The second .eq is the terminal call (returns a promise).
     * We need a mock where the first .eq returns an object with another .eq.
     */
    function createRevokeMock(result: { error: unknown; count: number | null }) {
      const secondEq = jest.fn().mockResolvedValue(result);
      const firstEq = jest.fn().mockReturnValue({ eq: secondEq });
      const update = jest.fn().mockReturnValue({ eq: firstEq });
      const from = jest.fn().mockReturnValue({ update });
      return { from, update, firstEq, secondEq } as unknown as SupabaseClient;
    }

    it("returns true on successful revocation", async () => {
      const supabase = createRevokeMock({ error: null, count: 1 });

      const result = await revokeShareLink(supabase, CONV_ID);
      expect(result).toBe(true);
    });

    it("returns false on error", async () => {
      const supabase = createRevokeMock({
        error: { message: "boom" },
        count: 0,
      });

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await revokeShareLink(supabase, CONV_ID);
      expect(result).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe("resolveShareToken", () => {
    it("returns share link + conversation when token is valid", async () => {
      const rowWithConv = {
        ...activeRow,
        conversations: {
          id: CONV_ID,
          title: "My Conversation",
          description: "A description",
          type: "open",
        },
      };
      const supabase = createMockSupabase({
        single: jest
          .fn()
          .mockResolvedValueOnce({ data: rowWithConv, error: null }),
      });

      const result = await resolveShareToken(supabase, "existing-token-abc");

      expect(result).not.toBeNull();
      expect(result!.conversationId).toBe(CONV_ID);
      expect(result!.conversationTitle).toBe("My Conversation");
      expect(result!.shareLink.token).toBe("existing-token-abc");
    });

    it("returns null when token is invalid or expired", async () => {
      const supabase = createMockSupabase({
        single: jest.fn().mockResolvedValueOnce({
          data: null,
          error: { message: "not found" },
        }),
      });

      const result = await resolveShareToken(supabase, "bad-token");
      expect(result).toBeNull();
    });
  });
});
