/** @jest-environment node */
/**
 * Integration tests for POST /api/conversations/[conversationId]/feedback
 *
 * Ensures request-body validation is robust (e.g. BIGINT ids as numbers).
 */

import { POST } from "@/app/api/conversations/[conversationId]/feedback/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/conversations/server/requireHiveMember");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";

type QueryResult<T = unknown> = { data: T; error: unknown; count?: number | null };
type QueryResultPromiseThen = Promise<QueryResult>["then"];
type QueryResultPromiseCatch = Promise<QueryResult>["catch"];

type SupabaseBuilder = {
  select: jest.MockedFunction<() => SupabaseBuilder>;
  eq: jest.MockedFunction<() => SupabaseBuilder>;
  upsert: jest.MockedFunction<() => Promise<{ error: null }>>;
  maybeSingle: jest.MockedFunction<() => Promise<QueryResult>>;
  then: QueryResultPromiseThen;
  catch: QueryResultPromiseCatch;
};

type SupabaseMock = {
  from: jest.MockedFunction<(table: string) => SupabaseBuilder>;
};

function createSupabaseMock() {
  const queues: Record<string, { maybeSingle: QueryResult[]; then: QueryResult[] }> =
    {};

  const ensure = (table: string) => {
    if (!queues[table]) queues[table] = { maybeSingle: [], then: [] };
    return queues[table];
  };

  const makeBuilder = (table: string): SupabaseBuilder => {
    const builder: SupabaseBuilder = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      upsert: jest.fn(async () => ({ error: null })),
      maybeSingle: jest.fn(async () => {
        const next = ensure(table).maybeSingle.shift();
        return next ?? { data: null, error: null };
      }),
      then: (onFulfilled, onRejected) => {
        const next = ensure(table).then.shift() ?? { data: null, error: null };
        return Promise.resolve(next).then(onFulfilled, onRejected);
      },
      catch: (onRejected) => builder.then((value) => value, onRejected),
    };
    return builder;
  };

  const supabase: SupabaseMock = {
    from: jest.fn((table: string) => makeBuilder(table)),
  };

  return {
    supabase,
    queueMaybeSingle: (table: string, result: QueryResult) =>
      ensure(table).maybeSingle.push(result),
    queueThen: (table: string, result: QueryResult) => ensure(table).then.push(result),
  };
}

describe("POST /api/conversations/[conversationId]/feedback", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;
  const mockRequireHiveMember = requireHiveMember as jest.MockedFunction<
    typeof requireHiveMember
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    });
    mockRequireHiveMember.mockResolvedValue(undefined);
  });

  it("accepts numeric responseId (BIGINT) and returns counts", async () => {
    const { supabase, queueMaybeSingle, queueThen } = createSupabaseMock();
    mockSupabaseServerClient.mockResolvedValue(
      supabase as unknown as Awaited<ReturnType<typeof supabaseServerClient>>
    );

    // Conversation lookup
    queueMaybeSingle("conversations", {
      data: { hive_id: "hive-1", type: "understand" },
      error: null,
    });

    // Response existence lookup
    queueMaybeSingle("conversation_responses", {
      data: { id: "123" },
      error: null,
    });

    // Count query result (await builder)
    queueThen("response_feedback", {
      data: [{ feedback: "agree" }, { feedback: "pass" }],
      error: null,
    });

    const request = new NextRequest(
      "http://localhost/api/conversations/conv-1/feedback",
      {
        method: "POST",
        body: JSON.stringify({ responseId: 123, feedback: "agree" }),
      }
    );

    const params = Promise.resolve({ conversationId: "conv-1" });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.counts).toEqual({ agree: 1, pass: 1, disagree: 0 });
  });
});
