/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/adminClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/conversations/guest/guestSessionService");
jest.mock("@/lib/auth/server/migrateGuestSession");

import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/guest-migration/execute/route";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import {
  getConvertibleGuestSession,
  clearGuestSessionCookie,
} from "@/lib/conversations/guest/guestSessionService";
import { migrateGuestSession } from "@/lib/auth/server/migrateGuestSession";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockGetConvertible = getConvertibleGuestSession as jest.MockedFunction<
  typeof getConvertibleGuestSession
>;
const mockMigrate = migrateGuestSession as jest.MockedFunction<
  typeof migrateGuestSession
>;
const mockAdminClient = supabaseAdminClient as jest.MockedFunction<
  typeof supabaseAdminClient
>;
const mockClearCookie = clearGuestSessionCookie as jest.MockedFunction<
  typeof clearGuestSessionCookie
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminClient.mockReturnValue({} as ReturnType<typeof supabaseAdminClient>);
  mockClearCookie.mockResolvedValue(undefined);
});

function createRequest(body: object): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/auth/guest-migration/execute",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/auth/guest-migration/execute", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(createRequest({ keepAnonymous: false }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when no convertible session", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
      roles: [],
    } as Awaited<ReturnType<typeof getServerSession>>);
    mockGetConvertible.mockResolvedValue(null);

    const res = await POST(createRequest({ keepAnonymous: false }));
    expect(res.status).toBe(404);
  });

  it("executes migration and clears cookie", async () => {
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
    mockMigrate.mockResolvedValue({
      responsesCount: 3,
      likesCount: 5,
      feedbackCount: 8,
      hiveIds: ["hive-001"],
    });

    const res = await POST(createRequest({ keepAnonymous: false }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.migrated).toBe(true);
    expect(body.responsesCount).toBe(3);
    expect(body.redirectTo).toBe("/hives/team-hive");

    expect(mockMigrate).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-123",
      guestSessionId: "gs-001",
      keepAnonymous: false,
    });
    expect(mockClearCookie).toHaveBeenCalled();
  });

  it("passes keepAnonymous: true when requested", async () => {
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
    mockMigrate.mockResolvedValue({
      responsesCount: 1,
      likesCount: 0,
      feedbackCount: 0,
      hiveIds: ["hive-001"],
    });

    const res = await POST(createRequest({ keepAnonymous: true }));
    expect(res.status).toBe(200);

    expect(mockMigrate).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-123",
      guestSessionId: "gs-001",
      keepAnonymous: true,
    });
  });

  it("returns 400 for invalid body", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
      roles: [],
    } as Awaited<ReturnType<typeof getServerSession>>);

    const res = await POST(createRequest({ invalid: "body" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing keepAnonymous", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
      roles: [],
    } as Awaited<ReturnType<typeof getServerSession>>);

    const res = await POST(createRequest({}));
    expect(res.status).toBe(400);
  });
});
