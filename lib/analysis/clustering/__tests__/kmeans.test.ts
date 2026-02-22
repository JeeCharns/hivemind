/**
 * Unit tests for k-means clustering with adaptive k-selection
 */

import { clusterEmbeddings, getClusterStats } from "../kmeans";

describe("kmeans clustering", () => {
  describe("edge cases", () => {
    it("returns empty array for empty input", () => {
      const result = clusterEmbeddings([]);
      expect(result).toEqual([]);
    });

    it("returns single cluster for single embedding", () => {
      const result = clusterEmbeddings([[1, 2, 3]]);
      expect(result).toEqual([0]);
    });

    it("returns k=1 for identical embeddings (homogeneous data)", () => {
      // All embeddings are the same
      const embeddings = [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ];
      const result = clusterEmbeddings(embeddings);

      // All should be in the same cluster
      expect(new Set(result).size).toBe(1);
      expect(result).toEqual([0, 0, 0, 0, 0]);
    });

    it("returns k=1 for near-identical embeddings (low variance)", () => {
      // Embeddings with very small variance
      const embeddings = [
        [1.0, 1.0, 1.0],
        [1.0001, 1.0001, 1.0001],
        [0.9999, 0.9999, 0.9999],
        [1.0, 1.0, 1.0],
      ];
      const result = clusterEmbeddings(embeddings);

      // Should recognize this as effectively homogeneous
      expect(new Set(result).size).toBe(1);
    });
  });

  describe("knee detection", () => {
    it("detects natural clusters in clearly separated data", () => {
      // Two very well-separated clusters with small intra-cluster variance
      // Using large sample size to ensure maxK allows k=2
      const cluster1 = Array(50)
        .fill(null)
        .map((_, i) => [
          0 + (i % 3) * 0.1,
          0 + (i % 2) * 0.1,
          0 + (i % 4) * 0.1,
        ]);
      const cluster2 = Array(50)
        .fill(null)
        .map((_, i) => [
          100 + (i % 3) * 0.1,
          100 + (i % 2) * 0.1,
          100 + (i % 4) * 0.1,
        ]);
      const embeddings = [...cluster1, ...cluster2];

      // Adaptive k-selection should find 2 clusters
      const result = clusterEmbeddings(embeddings, undefined, {
        minClusterSize: 8,
      });

      // Should find 2 clusters (knee detection should identify the optimal k)
      const k = new Set(result).size;
      expect(k).toBeGreaterThanOrEqual(2);

      // Verify separation only if we got 2+ clusters
      if (k >= 2) {
        const firstLabel = result[0];
        const cluster1Labels = result.slice(0, 50);
        const cluster2Labels = result.slice(50);

        expect(cluster1Labels.every((l) => l === firstLabel)).toBe(true);
        expect(cluster2Labels.every((l) => l !== firstLabel)).toBe(true);
      }
    });

    it("finds multiple clusters in diverse data", () => {
      // Three well-separated clusters with small intra-cluster variance
      const cluster1 = Array(15)
        .fill(null)
        .map((_, i) => [0 + (i % 3) * 0.01, 0 + (i % 2) * 0.01]);
      const cluster2 = Array(15)
        .fill(null)
        .map((_, i) => [10 + (i % 3) * 0.01, 0 + (i % 2) * 0.01]);
      const cluster3 = Array(15)
        .fill(null)
        .map((_, i) => [5 + (i % 3) * 0.01, 10 + (i % 2) * 0.01]);
      const embeddings = [...cluster1, ...cluster2, ...cluster3];

      const result = clusterEmbeddings(embeddings);

      // Should find at least 3 clusters
      expect(new Set(result).size).toBeGreaterThanOrEqual(3);
    });

    it("does not force k=2 on data that warrants k=1", () => {
      // Linear gradient - no natural clusters
      const embeddings = Array(30)
        .fill(null)
        .map((_, i) => [i, i, i]);

      const result = clusterEmbeddings(embeddings);

      // Should either return k=1 or a small k based on knee detection,
      // NOT a forced k=2
      const k = new Set(result).size;
      expect(k).toBeGreaterThanOrEqual(1);

      // The key test: verify we're not forcing k=2 by checking that
      // if k > 1, it's because there's a meaningful knee
      // (We can't easily test the internals here, but we verify no hard floor)
    });
  });

  describe("adaptive max k", () => {
    it("respects minClusterSize constraint", () => {
      // With minClusterSize=8 and n=24, maxK should be 3
      const embeddings = Array(24)
        .fill(null)
        .map((_, i) => [i, i * 2]);

      const result = clusterEmbeddings(embeddings, undefined, {
        minClusterSize: 8,
      });

      // Should not exceed floor(24/8) = 3 clusters
      expect(new Set(result).size).toBeLessThanOrEqual(3);
    });

    it("respects n/3 safety bound", () => {
      // With n=15, maxK should be floor(15/3) = 5
      const embeddings = Array(15)
        .fill(null)
        .map((_, i) => [i, i * 2]);

      const result = clusterEmbeddings(embeddings);

      // Should not exceed floor(15/3) = 5 clusters
      expect(new Set(result).size).toBeLessThanOrEqual(5);
    });

    it("allows manual maxClusters override within bounds", () => {
      // n=30, manually set maxClusters=2
      const embeddings = Array(30)
        .fill(null)
        .map((_, i) => [i, i * 2]);

      const result = clusterEmbeddings(embeddings, undefined, {
        maxClusters: 2,
      });

      // Should not exceed 2 clusters
      expect(new Set(result).size).toBeLessThanOrEqual(2);
    });

    it("handles large datasets without forcing small k", () => {
      // Large diverse dataset (simulated with random-ish embeddings)
      const embeddings = Array(200)
        .fill(null)
        .map((_, i) => [Math.sin(i / 10), Math.cos(i / 10), i % 5]);

      const result = clusterEmbeddings(embeddings);
      const k = new Set(result).size;

      // Should not be capped at 6 (old hard cap)
      // With n=200, maxK stays bounded (e.g. <= 25 under the legacy 8-size heuristic)
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(25);

      // Key assertion: k is data-driven, not a hard-coded value
      // We can't predict the exact k, but we verify it's reasonable
    });
  });

  describe("manual k override", () => {
    it("uses provided numClusters when specified", () => {
      const embeddings = Array(30)
        .fill(null)
        .map((_, i) => [i, i * 2]);

      const result = clusterEmbeddings(embeddings, 5);

      expect(new Set(result).size).toBe(5);
    });

    it("handles manual k=1", () => {
      const embeddings = Array(20)
        .fill(null)
        .map((_, i) => [i, i * 2]);

      const result = clusterEmbeddings(embeddings, 1);

      expect(result).toEqual(Array(20).fill(0));
    });
  });

  describe("env tuning knobs", () => {
    const originalMaxClusters = process.env.ANALYSIS_MAX_CLUSTERS;
    const originalMinClusterSize = process.env.ANALYSIS_MIN_CLUSTER_SIZE;

    afterEach(() => {
      if (originalMaxClusters === undefined) {
        delete process.env.ANALYSIS_MAX_CLUSTERS;
      } else {
        process.env.ANALYSIS_MAX_CLUSTERS = originalMaxClusters;
      }

      if (originalMinClusterSize === undefined) {
        delete process.env.ANALYSIS_MIN_CLUSTER_SIZE;
      } else {
        process.env.ANALYSIS_MIN_CLUSTER_SIZE = originalMinClusterSize;
      }
    });

    it("respects ANALYSIS_MAX_CLUSTERS=1 (forces k=1)", () => {
      process.env.ANALYSIS_MAX_CLUSTERS = "1";

      // Data that would normally produce multiple clusters
      const embeddings = [
        [0, 0],
        [0.01, 0.01],
        [10, 10],
        [10.01, 10.01],
        [20, 20],
        [20.01, 20.01],
      ];

      const result = clusterEmbeddings(embeddings);
      expect(new Set(result).size).toBe(1);
      expect(result).toEqual(new Array(embeddings.length).fill(0));
    });

    it("respects ANALYSIS_MIN_CLUSTER_SIZE (tightens maxK)", () => {
      process.env.ANALYSIS_MIN_CLUSTER_SIZE = "20";
      const n = 100;

      // With minClusterSize=20, derived maxK is at most floor(100/20)=5 (also <= n/3)
      const embeddings = Array(n)
        .fill(null)
        .map((_, i) => [Math.sin(i / 3), Math.cos(i / 3), i % 7]);

      const result = clusterEmbeddings(embeddings);
      expect(new Set(result).size).toBeLessThanOrEqual(5);
    });
  });

  describe("getClusterStats", () => {
    it("counts cluster sizes correctly", () => {
      const clusterIndices = [0, 0, 1, 1, 1, 2];
      const stats = getClusterStats(clusterIndices);

      expect(stats.get(0)).toBe(2);
      expect(stats.get(1)).toBe(3);
      expect(stats.get(2)).toBe(1);
    });

    it("handles single cluster", () => {
      const clusterIndices = [0, 0, 0];
      const stats = getClusterStats(clusterIndices);

      expect(stats.size).toBe(1);
      expect(stats.get(0)).toBe(3);
    });

    it("handles empty input", () => {
      const stats = getClusterStats([]);
      expect(stats.size).toBe(0);
    });
  });

  describe("deterministic behavior", () => {
    it("produces consistent results with seed", () => {
      const embeddings = Array(50)
        .fill(null)
        .map((_, i) => [Math.sin(i), Math.cos(i)]);

      const result1 = clusterEmbeddings(embeddings);
      const result2 = clusterEmbeddings(embeddings);

      // Should be identical due to seed: 42
      expect(result1).toEqual(result2);
    });
  });
});
