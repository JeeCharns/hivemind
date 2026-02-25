/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/adminClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/conversations/guest/guestSessionService");

import { GET } from "@/app/api/auth/guest-migration/check/route";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { getConvertibleGuestSession } from "@/lib/conversations/guest/guestSessionService";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockGetConvertible = getConvertibleGuestSession as jest.MockedFunction<
  typeof getConvertibleGuestSession
>;
const mockAdminClient = supabaseAdminClient as jest.MockedFunction<
  typeof supabaseAdminClient
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminClient.mockReturnValue({} as ReturnType<typeof supabaseAdminClient>);
});

describe("GET /api/auth/guest-migration/check", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns hasGuestSession: false when no convertible session", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
      roles: [],
    } as Awaited<ReturnType<typeof getServerSession>>);
    mockGetConvertible.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasGuestSession).toBe(false);
  });

  it("returns session info when convertible session exists", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
      roles: [],
    } as Awaited<ReturnType<typeof getServerSession>>);
    mockGetConvertible.mockResolvedValue({
      guestSessionId: "gs-001",
      guestNumber: 5,
      conversationId: "conv-001",
      conversationTitle: "Workshop",
      hiveId: "hive-001",
      hiveKey: "team-hive",
    });

    // Mock count queries
    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ count: 3, error: null }),
      }),
    });
    mockAdminClient.mockReturnValue({
      from: mockFrom,
    } as unknown as ReturnType<typeof supabaseAdminClient>);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasGuestSession).toBe(true);
    expect(body.guestNumber).toBe(5);
    expect(body.conversationTitle).toBe("Workshop");
    expect(body.hiveKey).toBe("team-hive");
    expect(body.responsesCount).toBe(3);
    expect(body.likesCount).toBe(3);
    expect(body.feedbackCount).toBe(3);
  });
});
