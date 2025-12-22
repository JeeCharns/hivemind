/**
 * Shared Test Utilities for Conversation Analysis Tests
 *
 * Provides mock factories and test data generators
 * Used across multiple test files for consistency
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriggerAnalysisResponse } from "../../schemas";

/**
 * Create a mock Supabase client with chainable methods
 *
 * This creates a flexible mock that can be configured per-test.
 * Tests should use mockResolvedValueOnce() on the terminal methods (single, maybeSingle)
 * to control what each query returns.
 *
 * @example
 * const supabase = createMockSupabase();
 *
 * // Mock conversation fetch
 * supabase.single.mockResolvedValueOnce({
 *   data: { id: "conv-123", ... },
 *   error: null
 * });
 *
 * // Mock count query (returns count, not data)
 * supabase.from.mockReturnValueOnce({
 *   ...supabase,
 *   select: jest.fn().mockReturnValue({
 *     ...supabase,
 *     eq: jest.fn().mockResolvedValue({ count: 25, error: null })
 *   })
 * });
 */
type SupabaseQueryResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

export type MockSupabaseChainable = {
  from: SupabaseClient["from"] & jest.Mock;
  select: jest.Mock;
  insert: jest.Mock;
  upsert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  gt: jest.Mock;
  is: jest.Mock;
  or: jest.Mock;
  not: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  head: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
} & SupabaseClient;

export type MockSupabaseQueryClient = {
  from: SupabaseClient["from"] & jest.Mock;
  select: jest.Mock;
  update: jest.Mock;
  insert: jest.Mock;
  upsert: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  gt: jest.Mock;
  is: jest.Mock;
  or: jest.Mock;
  not: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  head: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
} & SupabaseClient;

export function createMockSupabase(
  overrides: Partial<MockSupabaseChainable> = {}
): MockSupabaseChainable {
  const chainable = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    head: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  } as unknown as MockSupabaseChainable;

  return chainable;
}

type SupabaseOp = "select" | "update" | "insert" | "upsert" | "delete";

type SupabaseCallLogEntry = {
  table: string;
  method: string;
  args: unknown[];
};

/**
 * Create a Supabase mock that supports:
 * - thenable queries (`await supabase.from(...).select(...).eq(...)`)
 * - update/insert/delete chains (`await ...update(...).eq(...)`)
 * - `.single()` / `.maybeSingle()` terminal methods
 *
 * This is designed for more complex analysis services that build queries and `await` the query builder.
 */
export function createMockSupabaseQuery(overrides?: {
  defaultResults?: Partial<Record<SupabaseOp, SupabaseQueryResult>>;
}): {
  supabase: MockSupabaseQueryClient;
  queueResult: (table: string, op: SupabaseOp, result: SupabaseQueryResult) => void;
  queueSingle: (table: string, result: SupabaseQueryResult) => void;
  queueMaybeSingle: (table: string, result: SupabaseQueryResult) => void;
  getCallLog: () => SupabaseCallLogEntry[];
} {
  const callLog: SupabaseCallLogEntry[] = [];
  const queues = new Map<
    string,
    {
      select: SupabaseQueryResult[];
      update: SupabaseQueryResult[];
      insert: SupabaseQueryResult[];
      upsert: SupabaseQueryResult[];
      delete: SupabaseQueryResult[];
      single: SupabaseQueryResult[];
      maybeSingle: SupabaseQueryResult[];
    }
  >();

  const defaultResults: Record<SupabaseOp, SupabaseQueryResult> = {
    select: { data: null, error: null, count: null },
    update: { error: null },
    insert: { error: null },
    upsert: { error: null },
    delete: { error: null },
    ...(overrides?.defaultResults ?? {}),
  };

  function ensureTable(table: string) {
    if (!queues.has(table)) {
      queues.set(table, {
        select: [],
        update: [],
        insert: [],
        upsert: [],
        delete: [],
        single: [],
        maybeSingle: [],
      });
    }
    return queues.get(table)!;
  }

  function record(table: string, method: string, args: unknown[]) {
    callLog.push({ table, method, args });
  }

  const supabase = {
    from: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    gt: jest.fn(),
    is: jest.fn(),
    or: jest.fn(),
    not: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    head: jest.fn(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
  } as unknown as MockSupabaseQueryClient;

  function createBuilder(table: string) {
    const tableQueues = ensureTable(table);
    let op: SupabaseOp = "select";

    type OnFulfilled = (value: SupabaseQueryResult) => unknown;
    type OnRejected = (reason: unknown) => unknown;

    type MockSupabaseBuilder = {
      select: (...args: unknown[]) => MockSupabaseBuilder;
      update: (...args: unknown[]) => MockSupabaseBuilder;
      insert: (...args: unknown[]) => MockSupabaseBuilder;
      upsert: (...args: unknown[]) => MockSupabaseBuilder;
      delete: (...args: unknown[]) => MockSupabaseBuilder;
      eq: (...args: unknown[]) => MockSupabaseBuilder;
      gt: (...args: unknown[]) => MockSupabaseBuilder;
      is: (...args: unknown[]) => MockSupabaseBuilder;
      or: (...args: unknown[]) => MockSupabaseBuilder;
      not: (...args: unknown[]) => MockSupabaseBuilder;
      order: (...args: unknown[]) => MockSupabaseBuilder;
      limit: (...args: unknown[]) => MockSupabaseBuilder;
      head: (...args: unknown[]) => MockSupabaseBuilder;
      single: (...args: unknown[]) => Promise<SupabaseQueryResult>;
      maybeSingle: (...args: unknown[]) => Promise<SupabaseQueryResult>;
      then: (onFulfilled: OnFulfilled, onRejected?: OnRejected) => Promise<unknown>;
      catch: (onRejected: OnRejected) => Promise<unknown>;
    };

    const builder: MockSupabaseBuilder = {
      select: (...args: unknown[]) => {
        record(table, "select", args);
        supabase.select(...args);
        // `.select()` after `.insert()` / `.update()` / `.upsert()` specifies returning columns.
        if (op === "select") op = "select";
        return builder;
      },
      update: (...args: unknown[]) => {
        op = "update";
        record(table, "update", args);
        supabase.update(...args);
        return builder;
      },
      insert: (...args: unknown[]) => {
        op = "insert";
        record(table, "insert", args);
        supabase.insert(...args);
        return builder;
      },
      upsert: (...args: unknown[]) => {
        op = "upsert";
        record(table, "upsert", args);
        supabase.upsert(...args);
        return builder;
      },
      delete: (...args: unknown[]) => {
        op = "delete";
        record(table, "delete", args);
        supabase.delete(...args);
        return builder;
      },
      eq: (...args: unknown[]) => {
        record(table, "eq", args);
        supabase.eq(...args);
        return builder;
      },
      gt: (...args: unknown[]) => {
        record(table, "gt", args);
        supabase.gt(...args);
        return builder;
      },
      is: (...args: unknown[]) => {
        record(table, "is", args);
        supabase.is(...args);
        return builder;
      },
      or: (...args: unknown[]) => {
        record(table, "or", args);
        supabase.or(...args);
        return builder;
      },
      not: (...args: unknown[]) => {
        record(table, "not", args);
        supabase.not(...args);
        return builder;
      },
      order: (...args: unknown[]) => {
        record(table, "order", args);
        supabase.order(...args);
        return builder;
      },
      limit: (...args: unknown[]) => {
        record(table, "limit", args);
        supabase.limit(...args);
        return builder;
      },
      head: (...args: unknown[]) => {
        record(table, "head", args);
        supabase.head(...args);
        return builder;
      },
      single: async (...args: unknown[]) => {
        record(table, "single", args);
        supabase.single(...args);
        const result = tableQueues.single.shift();
        return result ?? { data: null, error: null };
      },
      maybeSingle: async (...args: unknown[]) => {
        record(table, "maybeSingle", args);
        supabase.maybeSingle(...args);
        const result = tableQueues.maybeSingle.shift();
        return result ?? { data: null, error: null };
      },
      then: (onFulfilled: OnFulfilled, onRejected?: OnRejected) => {
        const result = tableQueues[op].shift() ?? defaultResults[op];
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
      catch: (onRejected: OnRejected) => {
        return builder.then((x) => x, onRejected);
      },
    };

    return builder;
  }

  supabase.from.mockImplementation((table: string) => {
    record(table, "from", [table]);
    return createBuilder(table);
  });

  function queueResult(table: string, op: SupabaseOp, result: SupabaseQueryResult) {
    ensureTable(table)[op].push(result);
  }

  function queueSingle(table: string, result: SupabaseQueryResult) {
    ensureTable(table).single.push(result);
  }

  function queueMaybeSingle(table: string, result: SupabaseQueryResult) {
    ensureTable(table).maybeSingle.push(result);
  }

  function getCallLog() {
    return callLog;
  }

  return {
    supabase,
    queueResult,
    queueSingle,
    queueMaybeSingle,
    getCallLog,
  };
}

/**
 * Helper to mock a count query result
 *
 * Supabase count queries look like:
 *   const { count } = await supabase.from("table").select("*", { count: "exact", head: true }).eq("id", "123");
 *
 * @example
 * const supabase = createMockSupabase();
 * mockCountQuery(supabase, 25);
 */
export function mockCountQuery(supabase: { from: jest.Mock }, count: number): void {
  // Create a chain that resolves to { count, error }
  const countChain = {
    from: supabase.from, // Preserve from() for next query
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ count, error: null }),
    gt: jest.fn().mockResolvedValue({ count, error: null }),
    is: jest.fn().mockResolvedValue({ count, error: null }),
  };

  supabase.from.mockReturnValueOnce(countChain);
}

/**
 * Helper to mock a standard data query
 *
 * Supabase data queries look like:
 *   const { data } = await supabase.from("table").select("*").eq("id", "123").single();
 *   const { data } = await supabase.from("table").select("*").eq("id", "123").maybeSingle();
 *
 * @example
 * const supabase = createMockSupabase();
 * mockDataQuery(supabase, { id: "conv-123", title: "Test" }); // uses .single()
 * mockDataQuery(supabase, { id: "user-123" }, false); // uses .maybeSingle()
 */
export function mockDataQuery(
  supabase: { from: jest.Mock },
  data: unknown,
  useSingle: boolean = true
): void {
  const result = { data, error: null };

  // Create a chainable object that returns itself for all filter methods
  const terminal = jest.fn().mockResolvedValue(result);
  const dataChain: Record<string, unknown> = {
    from: supabase.from, // Preserve from() for next query
    single: terminal,
    maybeSingle: terminal,
  };

  // Keep `useSingle` for callers/documentation without changing behavior.
  if (useSingle) {
    dataChain.single = terminal;
  } else {
    dataChain.maybeSingle = terminal;
  }

  // All methods return the chain to support chaining
  dataChain.select = jest.fn().mockReturnValue(dataChain);
  dataChain.eq = jest.fn().mockReturnValue(dataChain);
  dataChain.gt = jest.fn().mockReturnValue(dataChain);
  dataChain.is = jest.fn().mockReturnValue(dataChain);
  dataChain.not = jest.fn().mockReturnValue(dataChain);
  dataChain.order = jest.fn().mockReturnValue(dataChain);
  dataChain.limit = jest.fn().mockReturnValue(dataChain);

  supabase.from.mockReturnValueOnce(dataChain as unknown);
}

/**
 * Helper to mock an insert operation
 *
 * Supabase inserts look like:
 *   const { error } = await supabase.from("table").insert({ ... });
 *
 * @example
 * const supabase = createMockSupabase();
 * mockInsert(supabase); // success
 * mockInsert(supabase, { code: "23505" }); // unique constraint violation
 */
export function mockInsert(supabase: { from: jest.Mock }, error: unknown = null): void {
  const insertResult = {
    data: error ? null : { id: "job-123" },
    error,
  };

  const insertChain = {
    from: supabase.from,
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(insertResult),
  };

  supabase.from.mockReturnValueOnce(insertChain);
}

/**
 * Helper to mock an update operation
 *
 * Supabase updates look like:
 *   const { error } = await supabase.from("table").update({ ... }).eq("id", "123");
 *
 * @example
 * const supabase = createMockSupabase();
 * mockUpdate(supabase); // success
 */
export function mockUpdate(supabase: { from: jest.Mock }, error: unknown = null): void {
  const updateChain = {
    from: supabase.from,
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ error }),
  };

  supabase.from.mockReturnValueOnce(updateChain);
}

describe("testUtils", () => {
  it("loads helper module", () => {
    expect(true).toBe(true);
  });
});

/**
 * Generate a mock conversation record
 */
export type ConversationRecord = {
  id: string;
  hive_id: string;
  type: "understand" | "decide";
  analysis_status: string | null;
  analysis_response_count: number | null;
  analysis_updated_at: string | null;
  title: string;
  slug: string;
};

export function generateConversation(
  overrides: Partial<ConversationRecord> = {}
): ConversationRecord {
  return {
    id: "conv-123",
    hive_id: "hive-456",
    type: "understand" as const,
    analysis_status: null,
    analysis_response_count: null,
    analysis_updated_at: null,
    title: "Test Conversation",
    slug: "test-conversation",
    ...overrides,
  };
}

/**
 * Generate mock conversation responses
 */
export function generateResponses(count: number, conversationId: string = "conv-123") {
  return Array.from({ length: count }, (_, i) => ({
    id: `resp-${i + 1}`,
    conversation_id: conversationId,
    response_text: `Response ${i + 1}`,
    user_id: `user-${i % 5}`,
    tag: null,
    cluster_index: null,
    x_umap: null,
    y_umap: null,
    created_at: new Date(Date.now() + i * 1000).toISOString(),
  }));
}

/**
 * Generate mock embeddings (normalized to unit length)
 */
export function generateEmbeddings(count: number, dim: number = 1536): number[][] {
  return Array.from({ length: count }, () => {
    const raw = Array.from({ length: dim }, () => Math.random() - 0.5);
    const magnitude = Math.sqrt(raw.reduce((sum, val) => sum + val * val, 0));
    return raw.map((val) => val / magnitude);
  });
}

/**
 * Generate a single embedding vector
 */
export function generateEmbedding(dim: number = 1536): number[] {
  const raw = Array.from({ length: dim }, () => Math.random() - 0.5);
  const magnitude = Math.sqrt(raw.reduce((sum, val) => sum + val * val, 0));
  return raw.map((val) => val / magnitude);
}

/**
 * Generate mock cluster models
 */
export function generateClusterModels(
  clusterCount: number,
  conversationId: string = "conv-123"
) {
  return Array.from({ length: clusterCount }, (_, i) => ({
    conversation_id: conversationId,
    cluster_index: i,
    centroid_embedding: generateEmbedding(),
    centroid_x_umap: Math.random() * 10 - 5,
    centroid_y_umap: Math.random() * 10 - 5,
    spread_radius: 0.5 + Math.random() * 0.5,
    updated_at: new Date().toISOString(),
  }));
}

/**
 * Generate mock themes
 */
export function generateThemes(
  clusterCount: number,
  conversationId: string = "conv-123"
) {
  return Array.from({ length: clusterCount }, (_, i) => ({
    conversation_id: conversationId,
    cluster_index: i,
    name: `Theme ${i + 1}`,
    description: `Description for theme ${i + 1}`,
    size: 5,
  }));
}

/**
 * Generate a mock hive membership record
 */
export function generateMembership(userId: string, hiveId: string = "hive-456") {
  return {
    user_id: userId,
    hive_id: hiveId,
    role: "member",
  };
}

/**
 * Create a mock OpenAI client
 */
export function createMockOpenAI(embeddingResponses?: number[][][]) {
  const defaultEmbeddings = embeddingResponses || [generateEmbeddings(1)];
  let callIndex = 0;

  return {
    embeddings: {
      create: jest.fn().mockImplementation(async ({ input }: { input: string | string[] }) => {
        const count = Array.isArray(input) ? input.length : 1;
        const embeddings =
          callIndex < defaultEmbeddings.length
            ? defaultEmbeddings[callIndex]
            : generateEmbeddings(count);
        callIndex++;

        return {
          data: embeddings.map((embedding) => ({ embedding })),
        };
      }),
    },
  };
}

/**
 * Assert that a strategy decision matches expected values
 */
export function expectStrategyDecision(
  result: TriggerAnalysisResponse,
  expectedStrategy: "incremental" | "full"
) {
  expect(result.status).toBe("queued");
  expect(result.strategy).toBe(expectedStrategy);
}

/**
 * Assert that analysis metadata matches expected values
 */
export function expectAnalysisMetadata(
  result: TriggerAnalysisResponse,
  expected: {
    currentResponseCount?: number;
    analysisResponseCount?: number | null;
    newResponsesSinceAnalysis?: number;
  }
) {
  if (expected.currentResponseCount !== undefined) {
    expect(result.currentResponseCount).toBe(expected.currentResponseCount);
  }
  if (expected.analysisResponseCount !== undefined) {
    expect(result.analysisResponseCount).toBe(expected.analysisResponseCount);
  }
  if (expected.newResponsesSinceAnalysis !== undefined) {
    expect(result.newResponsesSinceAnalysis).toBe(
      expected.newResponsesSinceAnalysis
    );
  }
}

/**
 * Calculate cosine distance between two vectors
 */
export function cosineDistance(a: number[], b: number[]): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) {
    return 2;
  }

  const cosineSimilarity = dotProduct / (magA * magB);
  return 1 - cosineSimilarity;
}

/**
 * Find the nearest cluster centroid for an embedding
 */
export function findNearestCluster(
  embedding: number[],
  clusterModels: Array<{ cluster_index: number; centroid_embedding: number[] }>
): number {
  let bestCluster = 0;
  let bestDistance = Infinity;

  for (const model of clusterModels) {
    const distance = cosineDistance(embedding, model.centroid_embedding);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCluster = model.cluster_index;
    }
  }

  return bestCluster;
}
