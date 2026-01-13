/**
 * Tests for runConversationAnalysisIncremental Service
 *
 * Focuses on correctness of:
 * - new response selection (gt vs is-null)
 * - incremental cluster assignment + 2D placement
 * - theme size updates and analysis metadata tracking
 * - error handling
 */

import { runConversationAnalysisIncremental } from "../runConversationAnalysisIncremental";
import { createOpenAIClient, generateEmbeddings } from "@/lib/analysis/openai/embeddingsClient";
import { createMockSupabaseQuery } from "./testUtils";

jest.mock("@/lib/analysis/openai/embeddingsClient", () => ({
  createOpenAIClient: jest.fn(),
  generateEmbeddings: jest.fn(),
}));

describe("runConversationAnalysisIncremental", () => {
  const conversationId = "conv-123";
  const baselineTimestamp = "2024-01-01T00:00:00Z";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function getMockArg0(mock: jest.Mock): unknown[] {
    return (mock.mock.calls as unknown[][]).map((call) => call[0]);
  }

  function getNumber(payload: Record<string, unknown>, key: string): number {
    const value = payload[key];
    if (typeof value !== "number") {
      throw new Error(`Expected ${key} to be a number`);
    }
    return value;
  }

  it("filters new responses by baseline timestamp when available", async () => {
    const { supabase, queueSingle, queueResult, getCallLog } =
      createMockSupabaseQuery();

    (createOpenAIClient as jest.Mock).mockReturnValue({});
    (generateEmbeddings as jest.Mock).mockResolvedValue([[1, 0, 0]]);

    queueSingle("conversations", {
      data: { analysis_updated_at: baselineTimestamp, analysis_response_count: 20 },
      error: null,
    });

    // New responses query
    queueResult("conversation_responses", "select", {
      data: [
        {
          id: "resp-1",
          response_text: "New response",
          user_id: "user-1",
          created_at: "2024-01-02T00:00:00Z",
        },
      ],
      error: null,
    });

    // Cluster models query
    queueResult("conversation_cluster_models", "select", {
      data: [
        {
          cluster_index: 0,
          centroid_embedding: [1, 0, 0],
          centroid_x_umap: 0,
          centroid_y_umap: 0,
          spread_radius: 1,
        },
      ],
      error: null,
    });

    // Cluster counts query (theme size update)
    queueResult("conversation_responses", "select", {
      data: [{ cluster_index: 0 }],
      error: null,
    });

    // Final count query
    queueResult("conversation_responses", "select", {
      count: 21,
      error: null,
    });

    await runConversationAnalysisIncremental(supabase, conversationId);

    const log = getCallLog();
    expect(
      log.some(
        (entry) =>
          entry.table === "conversation_responses" &&
          entry.method === "gt" &&
          entry.args[0] === "created_at" &&
          entry.args[1] === baselineTimestamp
      )
    ).toBe(true);
  });

  it("filters new responses by missing cluster assignment when no baseline timestamp", async () => {
    const { supabase, queueSingle, queueResult, getCallLog } =
      createMockSupabaseQuery();

    (createOpenAIClient as jest.Mock).mockReturnValue({});
    (generateEmbeddings as jest.Mock).mockResolvedValue([[1, 0, 0]]);

    queueSingle("conversations", {
      data: { analysis_updated_at: null, analysis_response_count: null },
      error: null,
    });

    // New responses query
    queueResult("conversation_responses", "select", {
      data: [
        {
          id: "resp-1",
          response_text: "New response",
          user_id: "user-1",
          created_at: "2024-01-02T00:00:00Z",
        },
      ],
      error: null,
    });

    // Cluster models query
    queueResult("conversation_cluster_models", "select", {
      data: [
        {
          cluster_index: 0,
          centroid_embedding: [1, 0, 0],
          centroid_x_umap: 0,
          centroid_y_umap: 0,
          spread_radius: 1,
        },
      ],
      error: null,
    });

    // Cluster counts query (theme size update)
    queueResult("conversation_responses", "select", {
      data: [{ cluster_index: 0 }],
      error: null,
    });

    // Final count query
    queueResult("conversation_responses", "select", {
      count: 1,
      error: null,
    });

    await runConversationAnalysisIncremental(supabase, conversationId);

    const log = getCallLog();
    expect(
      log.some(
        (entry) =>
          entry.table === "conversation_responses" &&
          entry.method === "is" &&
          entry.args[0] === "cluster_index" &&
          entry.args[1] === null
      )
    ).toBe(true);
  });

  it("returns early (ready) when there are no new responses", async () => {
    const { supabase, queueSingle, queueResult } = createMockSupabaseQuery();

    queueSingle("conversations", {
      data: { analysis_updated_at: baselineTimestamp, analysis_response_count: 20 },
      error: null,
    });

    // No new responses
    queueResult("conversation_responses", "select", {
      data: [],
      error: null,
    });

    await runConversationAnalysisIncremental(supabase, conversationId);

    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(
      getMockArg0(supabase.update).some(
        (payload) => isRecord(payload) && payload["analysis_status"] === "ready"
      )
    ).toBe(true);
  });

  it("assigns each new response to the nearest cluster centroid", async () => {
    const { supabase, queueSingle, queueResult } = createMockSupabaseQuery();

    (createOpenAIClient as jest.Mock).mockReturnValue({});

    // Two embeddings: one closer to cluster 0, one closer to cluster 1
    (generateEmbeddings as jest.Mock).mockResolvedValue([
      [1, 0, 0],
      [0, 1, 0],
    ]);

    queueSingle("conversations", {
      data: { analysis_updated_at: baselineTimestamp, analysis_response_count: 20 },
      error: null,
    });

    queueResult("conversation_responses", "select", {
      data: [
        {
          id: "resp-1",
          response_text: "A",
          user_id: "user-1",
          created_at: "2024-01-02T00:00:00Z",
        },
        {
          id: "resp-2",
          response_text: "B",
          user_id: "user-2",
          created_at: "2024-01-02T00:00:01Z",
        },
      ],
      error: null,
    });

    queueResult("conversation_cluster_models", "select", {
      data: [
        {
          cluster_index: 0,
          centroid_embedding: [1, 0, 0],
          centroid_x_umap: 0,
          centroid_y_umap: 0,
          spread_radius: 1,
        },
        {
          cluster_index: 1,
          centroid_embedding: [0, 1, 0],
          centroid_x_umap: 10,
          centroid_y_umap: 10,
          spread_radius: 1,
        },
      ],
      error: null,
    });

    queueResult("conversation_responses", "select", {
      data: [{ cluster_index: 0 }, { cluster_index: 1 }],
      error: null,
    });

    queueResult("conversation_responses", "select", {
      count: 22,
      error: null,
    });

    // Make placement deterministic so updates are stable
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);
    await runConversationAnalysisIncremental(supabase, conversationId);
    randomSpy.mockRestore();

    const responseUpdates = getMockArg0(supabase.update).filter(
      (payload): payload is Record<string, unknown> =>
        isRecord(payload) && payload["cluster_index"] !== undefined
    );

    expect(responseUpdates).toHaveLength(2);
    expect(responseUpdates[0]["cluster_index"]).toBe(0);
    expect(responseUpdates[1]["cluster_index"]).toBe(1);
  });

  it("places new points within spread radius of their assigned cluster centroid", async () => {
    const { supabase, queueSingle, queueResult } = createMockSupabaseQuery();

    (createOpenAIClient as jest.Mock).mockReturnValue({});
    (generateEmbeddings as jest.Mock).mockResolvedValue([[1, 0, 0]]);

    queueSingle("conversations", {
      data: { analysis_updated_at: baselineTimestamp, analysis_response_count: 20 },
      error: null,
    });

    queueResult("conversation_responses", "select", {
      data: [
        {
          id: "resp-1",
          response_text: "A",
          user_id: "user-1",
          created_at: "2024-01-02T00:00:00Z",
        },
      ],
      error: null,
    });

    queueResult("conversation_cluster_models", "select", {
      data: [
        {
          cluster_index: 0,
          centroid_embedding: [1, 0, 0],
          centroid_x_umap: 5,
          centroid_y_umap: 5,
          spread_radius: 2,
        },
      ],
      error: null,
    });

    queueResult("conversation_responses", "select", {
      data: [{ cluster_index: 0 }],
      error: null,
    });

    queueResult("conversation_responses", "select", {
      count: 21,
      error: null,
    });

    // Force radius == spread_radius by making Math.random() return 1 for radius calc,
    // but keep angle deterministic too. placeOnMap calls Math.random() twice per point:
    // - angle random
    // - radius random
    const randomSpy = jest
      .spyOn(Math, "random")
      .mockReturnValueOnce(0) // angle
      .mockReturnValueOnce(1); // radius (max)

    await runConversationAnalysisIncremental(supabase, conversationId);
    randomSpy.mockRestore();

    const responseUpdate = getMockArg0(supabase.update).find(
      (payload): payload is Record<string, unknown> =>
        isRecord(payload) && payload["cluster_index"] !== undefined
    );

    expect(responseUpdate).toBeTruthy();

    if (!responseUpdate) {
      throw new Error("Expected a response update payload");
    }

    const xUmap = getNumber(responseUpdate, "x_umap");
    const yUmap = getNumber(responseUpdate, "y_umap");
    const distance = Math.sqrt(
      (xUmap - 5) ** 2 + (yUmap - 5) ** 2
    );
    expect(distance).toBeLessThanOrEqual(2);
  });

  it("updates theme sizes and analysis metadata on success", async () => {
    const { supabase, queueSingle, queueResult } = createMockSupabaseQuery();

    (createOpenAIClient as jest.Mock).mockReturnValue({});
    (generateEmbeddings as jest.Mock).mockResolvedValue([[1, 0, 0]]);

    queueSingle("conversations", {
      data: { analysis_updated_at: baselineTimestamp, analysis_response_count: 20 },
      error: null,
    });

    queueResult("conversation_responses", "select", {
      data: [
        {
          id: "resp-1",
          response_text: "A",
          user_id: "user-1",
          created_at: "2024-01-02T00:00:00Z",
        },
      ],
      error: null,
    });

    queueResult("conversation_cluster_models", "select", {
      data: [
        {
          cluster_index: 0,
          centroid_embedding: [1, 0, 0],
          centroid_x_umap: 0,
          centroid_y_umap: 0,
          spread_radius: 1,
        },
      ],
      error: null,
    });

    // Existing cluster sizes query inside loadClusterModels
    queueResult("conversation_responses", "select", {
      data: [{ cluster_index: 0 }, { cluster_index: 0 }],
      error: null,
    });

    // Cluster counts query for updateThemeSizes - results in 3 members total
    queueResult("conversation_responses", "select", {
      data: [{ cluster_index: 0 }, { cluster_index: 0 }, { cluster_index: 0 }],
      error: null,
    });

    queueResult("conversation_responses", "select", {
      count: 21,
      error: null,
    });

    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);
    await runConversationAnalysisIncremental(supabase, conversationId);
    randomSpy.mockRestore();

    // Theme update is `update({ size })` so look for `size` payload.
    expect(
      getMockArg0(supabase.update).some(
        (payload) => isRecord(payload) && payload["size"] === 3
      )
    ).toBe(true);

    // Metadata update is `update({ analysis_response_count, analysis_updated_at })`
    expect(
      getMockArg0(supabase.update).some(
        (payload) =>
          isRecord(payload) && payload["analysis_response_count"] === 21
      )
    ).toBe(true);

    // Final ready status
    expect(
      getMockArg0(supabase.update).some(
        (payload) => isRecord(payload) && payload["analysis_status"] === "ready"
      )
    ).toBe(true);
  });

  it("throws when no cluster models exist and marks analysis_status as error", async () => {
    const { supabase, queueSingle, queueResult } = createMockSupabaseQuery();

    (createOpenAIClient as jest.Mock).mockReturnValue({});
    (generateEmbeddings as jest.Mock).mockResolvedValue([[1, 0, 0]]);

    queueSingle("conversations", {
      data: { analysis_updated_at: baselineTimestamp, analysis_response_count: 20 },
      error: null,
    });

    queueResult("conversation_responses", "select", {
      data: [
        {
          id: "resp-1",
          response_text: "A",
          user_id: "user-1",
          created_at: "2024-01-02T00:00:00Z",
        },
      ],
      error: null,
    });

    queueResult("conversation_cluster_models", "select", {
      data: [],
      error: null,
    });

    await expect(
      runConversationAnalysisIncremental(supabase, conversationId)
    ).rejects.toThrow("prerequisites missing");

    expect(
      getMockArg0(supabase.update).some(
        (payload) => isRecord(payload) && payload["analysis_status"] === "error"
      )
    ).toBe(true);
  });

  it("throws when conversation baseline cannot be loaded", async () => {
    const { supabase, queueSingle } = createMockSupabaseQuery();

    queueSingle("conversations", {
      data: null,
      error: { message: "Not found" },
    });

    await expect(
      runConversationAnalysisIncremental(supabase, conversationId)
    ).rejects.toThrow("Conversation not found");
  });
});
