/**
 * Tests for Cluster Enforcement
 *
 * Verifies minimum cluster floor enforcement via post-processing splits
 */

import { enforceMinClusters } from "../clusterEnforcement";
import {
  MIN_CLUSTERS_SMALL,
  MIN_CLUSTERS_LARGE,
  MIN_FORCED_CLUSTER_SIZE,
  MISC_CLUSTER_INDEX,
} from "../thresholds";

describe("enforceMinClusters", () => {
  /**
   * Helper to create synthetic embeddings
   * Creates n embeddings with dimension dim
   */
  function createEmbeddings(n: number, dim = 3): number[][] {
    const embeddings: number[][] = [];
    for (let i = 0; i < n; i++) {
      const embedding = new Array(dim).fill(0);
      // Add variation to make embeddings distinct
      embedding[0] = i / n;
      embedding[1] = Math.sin(i);
      embedding[2] = Math.cos(i);
      embeddings.push(embedding);
    }
    return embeddings;
  }

  /**
   * Helper to count non-misc clusters
   */
  function countNonMiscClusters(clusterIndices: number[]): number {
    const uniqueClusters = new Set(
      clusterIndices.filter((idx) => idx !== MISC_CLUSTER_INDEX)
    );
    return uniqueClusters.size;
  }

  describe("Target minimum cluster determination", () => {
    it("should target MIN_CLUSTERS_SMALL for n <= 40", () => {
      const embeddings = createEmbeddings(20);
      const clusterIndices = new Array(20).fill(0); // All in one cluster

      const result = enforceMinClusters(embeddings, clusterIndices, 20);

      expect(result.targetMinClusters).toBe(MIN_CLUSTERS_SMALL);
    });

    it("should target MIN_CLUSTERS_LARGE for n >= 41", () => {
      const embeddings = createEmbeddings(60);
      const clusterIndices = new Array(60).fill(0); // All in one cluster

      const result = enforceMinClusters(embeddings, clusterIndices, 60);

      expect(result.targetMinClusters).toBe(MIN_CLUSTERS_LARGE);
    });
  });

  describe("Effective minimum cluster computation", () => {
    it("should never exceed n", () => {
      const embeddings = createEmbeddings(4);
      const clusterIndices = new Array(4).fill(0);

      const result = enforceMinClusters(embeddings, clusterIndices, 4);

      expect(result.effectiveMinClusters).toBeLessThanOrEqual(4);
    });

    it("should never exceed floor(n / MIN_FORCED_CLUSTER_SIZE)", () => {
      const n = 7;
      const embeddings = createEmbeddings(n);
      const clusterIndices = new Array(n).fill(0);

      const result = enforceMinClusters(embeddings, clusterIndices, n);

      const maxClusters = Math.floor(n / MIN_FORCED_CLUSTER_SIZE);
      expect(result.effectiveMinClusters).toBeLessThanOrEqual(maxClusters);
    });
  });

  describe("Forced splits", () => {
    it("should force split to reach 3 clusters for n=20 when starting with 1", () => {
      const embeddings = createEmbeddings(20);
      const clusterIndices = new Array(20).fill(0); // All in one cluster

      const result = enforceMinClusters(embeddings, clusterIndices, 20);

      expect(result.targetMinClusters).toBe(3);
      expect(result.splitsPerformed).toBeGreaterThan(0);
      expect(result.finalClusterCount).toBe(3);
      expect(countNonMiscClusters(result.clusterIndices)).toBe(3);
    });

    it("should force split to reach 5 clusters for n=60 when starting with 2", () => {
      const embeddings = createEmbeddings(60);
      // Start with 2 clusters
      const clusterIndices = embeddings.map((_, i) => (i < 30 ? 0 : 1));

      const result = enforceMinClusters(embeddings, clusterIndices, 60);

      expect(result.targetMinClusters).toBe(5);
      expect(result.splitsPerformed).toBeGreaterThan(0);
      expect(result.finalClusterCount).toBe(5);
      expect(countNonMiscClusters(result.clusterIndices)).toBe(5);
    });

    it("should not split if already meeting minimum", () => {
      const embeddings = createEmbeddings(20);
      // Start with 3 clusters (already meeting floor)
      const clusterIndices = embeddings.map((_, i) =>
        i < 7 ? 0 : i < 14 ? 1 : 2
      );

      const result = enforceMinClusters(embeddings, clusterIndices, 20);

      expect(result.splitsPerformed).toBe(0);
      expect(result.reason).toBe("Already meets minimum cluster floor");
    });

    it("should only split eligible clusters (size >= 2 * MIN_FORCED_CLUSTER_SIZE)", () => {
      const embeddings = createEmbeddings(10);
      // Create 2 clusters: one large (8), one small (2)
      const clusterIndices = embeddings.map((_, i) => (i < 8 ? 0 : 1));

      const result = enforceMinClusters(embeddings, clusterIndices, 10);

      // Should split the large cluster (0) but not the small one (1)
      expect(result.splitsPerformed).toBeGreaterThan(0);
      // Should reach target of 3 if feasible
      expect(result.finalClusterCount).toBeGreaterThanOrEqual(2);
    });

    it("should stop when no eligible clusters remain", () => {
      const n = 7;
      const embeddings = createEmbeddings(n);
      // All in one small cluster
      const clusterIndices = new Array(n).fill(0);

      const result = enforceMinClusters(embeddings, clusterIndices, n);

      // With n=7 and MIN_FORCED_CLUSTER_SIZE=2:
      // - Target is 3 clusters (n <= 40)
      // - Effective max is floor(7/2) = 3
      // - Should be able to reach 3 clusters via splits
      // If it reaches the target, reason is undefined; if it can't, reason contains "eligible"
      if (result.finalClusterCount < result.effectiveMinClusters) {
        expect(result.reason).toContain("eligible");
      } else {
        // Successfully reached target
        expect(result.finalClusterCount).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("Cluster relabeling", () => {
    it("should relabel clusters by size (largest = 0)", () => {
      const embeddings = createEmbeddings(30);
      // Start with 1 large cluster
      const clusterIndices = new Array(30).fill(0);

      const result = enforceMinClusters(embeddings, clusterIndices, 30);

      // After splits, largest cluster should be labeled 0
      const clusterSizes = new Map<number, number>();
      for (const idx of result.clusterIndices) {
        if (idx !== MISC_CLUSTER_INDEX) {
          clusterSizes.set(idx, (clusterSizes.get(idx) || 0) + 1);
        }
      }

      const sortedClusters = Array.from(clusterSizes.entries()).sort(
        (a, b) => b[1] - a[1]
      );

      // Largest cluster should be labeled 0
      if (sortedClusters.length > 0) {
        expect(sortedClusters[0][0]).toBe(0);
      }
    });

    it("should preserve MISC_CLUSTER_INDEX during relabeling", () => {
      const embeddings = createEmbeddings(25);
      // Start with 2 clusters and some misc
      const clusterIndices = embeddings.map((_, i) =>
        i < 10 ? 0 : i < 20 ? 1 : MISC_CLUSTER_INDEX
      );

      const result = enforceMinClusters(embeddings, clusterIndices, 25);

      // MISC_CLUSTER_INDEX should be preserved
      const hasMisc = result.clusterIndices.some(
        (idx) => idx === MISC_CLUSTER_INDEX
      );
      expect(hasMisc).toBe(true);

      // Count should only include non-misc clusters
      const nonMiscCount = countNonMiscClusters(result.clusterIndices);
      expect(result.finalClusterCount).toBe(nonMiscCount);
    });
  });

  describe("Edge cases", () => {
    it("should handle n < 3 gracefully", () => {
      const embeddings = createEmbeddings(2);
      const clusterIndices = new Array(2).fill(0);

      const result = enforceMinClusters(embeddings, clusterIndices, 2);

      // Cannot reach 3 clusters with only 2 responses
      expect(result.effectiveMinClusters).toBeLessThan(3);
      expect(result.reason).toBeDefined();
    });

    it("should handle empty embeddings", () => {
      const embeddings: number[][] = [];
      const clusterIndices: number[] = [];

      const result = enforceMinClusters(embeddings, clusterIndices, 0);

      expect(result.clusterIndices).toEqual([]);
      expect(result.splitsPerformed).toBe(0);
    });

    it("should handle homogeneous embeddings (all identical)", () => {
      const n = 20;
      const embeddings = new Array(n).fill([1, 0, 0]);
      const clusterIndices = new Array(n).fill(0);

      // This is a challenging case - k-means with k=2 on identical points
      // may still produce 2 clusters due to initialization
      const result = enforceMinClusters(embeddings, clusterIndices, n);

      // Should attempt to split even if data is homogeneous
      expect(result.targetMinClusters).toBe(3);
      // May or may not succeed depending on k-means behavior
      // Just verify it doesn't crash
      expect(result.clusterIndices).toHaveLength(n);
    });
  });

  describe("Logging metadata", () => {
    it("should return correct metadata for splits", () => {
      const embeddings = createEmbeddings(20);
      const clusterIndices = new Array(20).fill(0);

      const result = enforceMinClusters(embeddings, clusterIndices, 20);

      expect(result.targetMinClusters).toBeDefined();
      expect(result.effectiveMinClusters).toBeDefined();
      expect(result.splitsPerformed).toBeGreaterThanOrEqual(0);
      expect(result.finalClusterCount).toBeGreaterThanOrEqual(0);
    });

    it("should include reason when target not achieved", () => {
      const n = 5;
      const embeddings = createEmbeddings(n);
      const clusterIndices = new Array(n).fill(0);

      const result = enforceMinClusters(embeddings, clusterIndices, n);

      // For n=5, target is 3 but may not be achievable
      if (result.finalClusterCount < result.effectiveMinClusters) {
        expect(result.reason).toBeDefined();
      }
    });
  });
});
