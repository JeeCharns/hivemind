/**
 * Tests for Cluster Model Persistence (runConversationAnalysis)
 *
 * These tests validate that the full analysis pipeline persists cluster models
 * used by incremental analysis (centroid embeddings + 2D centroids + spread radius).
 */

import { runConversationAnalysis } from "../runConversationAnalysis";
import {
  createOpenAIClient,
  generateEmbeddings,
} from "@/lib/analysis/openai/embeddingsClient";
import { reduceToTwoD } from "@/lib/analysis/clustering/dimensionReduction";
import { clusterEmbeddings } from "@/lib/analysis/clustering/kmeans";
import { generateThemes } from "@/lib/analysis/openai/themeGenerator";
import { createMockSupabaseQuery } from "./testUtils";

jest.mock("@/lib/analysis/openai/embeddingsClient");
jest.mock("@/lib/analysis/clustering/dimensionReduction");
jest.mock("@/lib/analysis/clustering/kmeans");
jest.mock("@/lib/analysis/openai/themeGenerator");

describe("saveClusterModels (in runConversationAnalysis)", () => {
  const conversationId = "conv-123";

  beforeEach(() => {
    jest.clearAllMocks();
    (createOpenAIClient as jest.Mock).mockReturnValue({});
  });

  type ClusterModelRow = {
    cluster_index: number;
    centroid_embedding: number[];
    centroid_x_umap: number;
    centroid_y_umap: number;
    spread_radius: number;
  };

  function findClusterModelInsert(
    log: Array<{ table: string; method: string; args: unknown[] }>
  ): ClusterModelRow[] | undefined {
    const insertEntry = log.find(
      (e) =>
        e.table === "conversation_cluster_models" &&
        e.method === "insert" &&
        Array.isArray(e.args[0])
    );
    const models = insertEntry?.args[0];
    if (!Array.isArray(models)) return undefined;
    return models as unknown as ClusterModelRow[];
  }

  it("saves cluster models after successful analysis", async () => {
    const { supabase, queueResult, getCallLog } = createMockSupabaseQuery();

    // 25 responses
    queueResult("conversation_responses", "select", {
      data: Array.from({ length: 25 }, (_, i) => ({
        id: `resp-${i + 1}`,
        response_text: `Response ${i + 1}`,
        user_id: `user-${i % 3}`,
      })),
      error: null,
    });

    const embeddings = Array.from({ length: 25 }, () => [1, 0, 0]);
    (generateEmbeddings as jest.Mock).mockResolvedValue(embeddings);

    const coordinates = Array.from({ length: 25 }, () => [0, 0]);
    (reduceToTwoD as jest.Mock).mockReturnValue(coordinates);

    // 3 clusters with sizes 9/8/8
    const clusterIndices = Array.from({ length: 25 }, (_, i) => i % 3);
    (clusterEmbeddings as jest.Mock).mockReturnValue(clusterIndices);

    (generateThemes as jest.Mock).mockResolvedValue([
      { clusterIndex: 0, name: "Theme 1", description: "Desc 1", size: 9 },
      { clusterIndex: 1, name: "Theme 2", description: "Desc 2", size: 8 },
      { clusterIndex: 2, name: "Theme 3", description: "Desc 3", size: 8 },
    ]);

    await runConversationAnalysis(supabase, conversationId);

    const models = findClusterModelInsert(getCallLog());
    expect(models).toBeTruthy();
    expect(models).toHaveLength(3);
    expect(models![0]).toHaveProperty("centroid_embedding");
    expect(models![0]).toHaveProperty("centroid_x_umap");
    expect(models![0]).toHaveProperty("centroid_y_umap");
    expect(models![0]).toHaveProperty("spread_radius");
  });

  it("computes correct centroids in embedding space", async () => {
    const { supabase, queueResult, getCallLog } = createMockSupabaseQuery();

    queueResult("conversation_responses", "select", {
      data: Array.from({ length: 9 }, (_, i) => ({
        id: `resp-${i + 1}`,
        response_text: `Response ${i + 1}`,
        user_id: `user-${i % 3}`,
      })),
      error: null,
    });

    const embeddings = [
      [1, 0, 0],
      [1, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    ];
    (generateEmbeddings as jest.Mock).mockResolvedValue(embeddings);
    (reduceToTwoD as jest.Mock).mockReturnValue(
      Array.from({ length: 9 }, () => [0, 0])
    );
    (clusterEmbeddings as jest.Mock).mockReturnValue([
      0, 0, 0, 1, 1, 1, 2, 2, 2,
    ]);
    (generateThemes as jest.Mock).mockResolvedValue([
      { clusterIndex: 0, name: "Theme 1", description: "Desc 1", size: 3 },
      { clusterIndex: 1, name: "Theme 2", description: "Desc 2", size: 3 },
      { clusterIndex: 2, name: "Theme 3", description: "Desc 3", size: 3 },
    ]);

    await runConversationAnalysis(supabase, conversationId);

    const models = findClusterModelInsert(getCallLog())!;
    const cluster0 = models.find((m) => m.cluster_index === 0)!;
    const cluster1 = models.find((m) => m.cluster_index === 1)!;
    const cluster2 = models.find((m) => m.cluster_index === 2)!;

    expect(cluster0.centroid_embedding).toEqual([1, 0, 0]);
    expect(cluster1.centroid_embedding).toEqual([0, 1, 0]);
    expect(cluster2.centroid_embedding).toEqual([0, 0, 1]);
  });

  it("computes 2D centroids correctly", async () => {
    const { supabase, queueResult, getCallLog } = createMockSupabaseQuery();

    queueResult("conversation_responses", "select", {
      data: Array.from({ length: 6 }, (_, i) => ({
        id: `resp-${i + 1}`,
        response_text: `Response ${i + 1}`,
        user_id: `user-${i % 2}`,
      })),
      error: null,
    });

    (generateEmbeddings as jest.Mock).mockResolvedValue(
      Array.from({ length: 6 }, () => [1, 0, 0])
    );

    const coordinates = [
      [0, 0],
      [2, 0],
      [1, 0],
      [5, 5],
      [7, 5],
      [6, 5],
    ];
    (reduceToTwoD as jest.Mock).mockReturnValue(coordinates);
    (clusterEmbeddings as jest.Mock).mockReturnValue([0, 0, 0, 1, 1, 1]);
    (generateThemes as jest.Mock).mockResolvedValue([
      { clusterIndex: 0, name: "Theme 1", description: "Desc 1", size: 3 },
      { clusterIndex: 1, name: "Theme 2", description: "Desc 2", size: 3 },
    ]);

    await runConversationAnalysis(supabase, conversationId);

    const models = findClusterModelInsert(getCallLog())!;
    const cluster0 = models.find((m) => m.cluster_index === 0)!;
    const cluster1 = models.find((m) => m.cluster_index === 1)!;

    expect(cluster0.centroid_x_umap).toBe(1);
    expect(cluster0.centroid_y_umap).toBe(0);
    expect(cluster1.centroid_x_umap).toBe(6);
    expect(cluster1.centroid_y_umap).toBe(5);
  });

  it("computes spread radius correctly (max distance * 1.1)", async () => {
    const { supabase, queueResult, getCallLog } = createMockSupabaseQuery();

    queueResult("conversation_responses", "select", {
      data: Array.from({ length: 3 }, (_, i) => ({
        id: `resp-${i + 1}`,
        response_text: `Response ${i + 1}`,
        user_id: "user-1",
      })),
      error: null,
    });

    (generateEmbeddings as jest.Mock).mockResolvedValue([
      [1, 0],
      [1, 0],
      [1, 0],
    ]);
    (reduceToTwoD as jest.Mock).mockReturnValue([
      [0, 0],
      [2, 0],
      [1, 0],
    ]);
    (clusterEmbeddings as jest.Mock).mockReturnValue([0, 0, 0]);
    (generateThemes as jest.Mock).mockResolvedValue([
      { clusterIndex: 0, name: "Theme 1", description: "Desc 1", size: 3 },
    ]);

    await runConversationAnalysis(supabase, conversationId);

    const models = findClusterModelInsert(getCallLog())!;
    const cluster0 = models[0];

    // centroid is [1, 0], max distance is 1, spread radius adds 10% padding
    expect(cluster0.spread_radius).toBeCloseTo(1.1, 2);
  });

  it("deletes old cluster models before inserting new ones", async () => {
    const { supabase, queueResult, getCallLog } = createMockSupabaseQuery();

    queueResult("conversation_responses", "select", {
      data: Array.from({ length: 10 }, (_, i) => ({
        id: `resp-${i + 1}`,
        response_text: `Response ${i + 1}`,
        user_id: `user-${i % 2}`,
      })),
      error: null,
    });

    (generateEmbeddings as jest.Mock).mockResolvedValue(
      Array.from({ length: 10 }, () => [1, 0, 0])
    );
    (reduceToTwoD as jest.Mock).mockReturnValue(
      Array.from({ length: 10 }, () => [0, 0])
    );
    (clusterEmbeddings as jest.Mock).mockReturnValue(
      Array.from({ length: 10 }, (_, i) => i % 2)
    );
    (generateThemes as jest.Mock).mockResolvedValue([
      { clusterIndex: 0, name: "Theme 1", description: "Desc 1", size: 5 },
      { clusterIndex: 1, name: "Theme 2", description: "Desc 2", size: 5 },
    ]);

    await runConversationAnalysis(supabase, conversationId);

    const log = getCallLog();
    const deleteIdx = log.findIndex(
      (e) => e.table === "conversation_cluster_models" && e.method === "delete"
    );
    const insertIdx = log.findIndex(
      (e) => e.table === "conversation_cluster_models" && e.method === "insert"
    );
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeLessThan(insertIdx);
  });

  it("saves cluster models before analysis_status is set to ready", async () => {
    const { supabase, queueResult, getCallLog } = createMockSupabaseQuery();

    queueResult("conversation_responses", "select", {
      data: Array.from({ length: 10 }, (_, i) => ({
        id: `resp-${i + 1}`,
        response_text: `Response ${i + 1}`,
        user_id: `user-${i % 2}`,
      })),
      error: null,
    });

    (generateEmbeddings as jest.Mock).mockResolvedValue(
      Array.from({ length: 10 }, () => [1, 0, 0])
    );
    (reduceToTwoD as jest.Mock).mockReturnValue(
      Array.from({ length: 10 }, () => [0, 0])
    );
    (clusterEmbeddings as jest.Mock).mockReturnValue(
      Array.from({ length: 10 }, (_, i) => i % 2)
    );
    (generateThemes as jest.Mock).mockResolvedValue([
      { clusterIndex: 0, name: "Theme 1", description: "Desc 1", size: 5 },
      { clusterIndex: 1, name: "Theme 2", description: "Desc 2", size: 5 },
    ]);

    await runConversationAnalysis(supabase, conversationId);

    const log = getCallLog();
    const insertIdx = log.findIndex(
      (e) => e.table === "conversation_cluster_models" && e.method === "insert"
    );
    const readyStatusIdx = log.findIndex(
      (e) =>
        e.table === "conversations" &&
        e.method === "update" &&
        typeof e.args[0] === "object" &&
        e.args[0] !== null &&
        "analysis_status" in e.args[0] &&
        (e.args[0] as Record<string, unknown>).analysis_status === "ready"
    );

    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(readyStatusIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeLessThan(readyStatusIdx);
  });
});
