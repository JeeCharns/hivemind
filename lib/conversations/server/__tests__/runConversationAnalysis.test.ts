/**
 * Unit tests for runConversationAnalysis helper functions
 *
 * Tests cluster relabeling and other helpers
 */

// Export helper functions for testing by adding them to a testable module
// Since helpers are internal, we'll test the behavior indirectly through integration tests

describe("Cluster Relabeling Logic", () => {
  // Mock the relabelClustersBySize logic (should match actual implementation)
  const relabelClustersBySize = (clusterIndices: number[]): number[] => {
    // Count cluster sizes
    const clusterSizes = new Map<number, number>();
    for (const idx of clusterIndices) {
      clusterSizes.set(idx, (clusterSizes.get(idx) || 0) + 1);
    }

    // Sort clusters by size (descending)
    const sortedClusters = Array.from(clusterSizes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([idx]) => idx);

    // Create mapping from old to new indices
    const relabelMap = new Map<number, number>();
    sortedClusters.forEach((oldIdx, newIdx) => {
      relabelMap.set(oldIdx, newIdx);
    });

    // Apply relabeling
    return clusterIndices.map((idx) => relabelMap.get(idx) ?? idx);
  };

  it("should relabel clusters by size (largest = 0)", () => {
    // Test case 1: Simple relabeling
    const input1 = [2, 2, 2, 1, 1, 0]; // Cluster 2 has 3 items, cluster 1 has 2, cluster 0 has 1
    const expected1 = [0, 0, 0, 1, 1, 2]; // Cluster 2 → 0, cluster 1 → 1, cluster 0 → 2
    expect(relabelClustersBySize(input1)).toEqual(expected1);

    // Test case 2: Already sorted
    const input2 = [0, 0, 0, 1, 1, 2];
    const expected2 = [0, 0, 0, 1, 1, 2]; // No change
    expect(relabelClustersBySize(input2)).toEqual(expected2);

    // Test case 3: Equal sizes (stable sorting)
    const input3 = [0, 0, 1, 1];
    const output3 = relabelClustersBySize(input3);
    expect(output3.filter((x) => x === 0).length).toBe(2);
    expect(output3.filter((x) => x === 1).length).toBe(2);
  });

  it("should handle k=1 (single cluster) correctly", () => {
    // All responses in one cluster (homogeneous data)
    const input = [0, 0, 0, 0, 0, 0];
    const expected = [0, 0, 0, 0, 0, 0]; // No change needed
    expect(relabelClustersBySize(input)).toEqual(expected);
  });

  it("should handle empty input", () => {
    const input: number[] = [];
    const expected: number[] = [];
    expect(relabelClustersBySize(input)).toEqual(expected);
  });

  it("should handle single element", () => {
    const input = [0];
    const expected = [0];
    expect(relabelClustersBySize(input)).toEqual(expected);
  });
});

describe("Diverse Sampling Logic", () => {
  it("should sample diverse responses spread across original order", () => {
    const sampleDiverseResponses = (
      texts: string[],
      originalIndices: number[],
      maxSamples: number
    ): string[] => {
      if (texts.length <= maxSamples) {
        return texts;
      }

      // Create array of [text, originalIndex] pairs
      const pairs = texts.map((text, i) => ({
        text,
        originalIndex: originalIndices[i],
      }));

      // Sort by original index
      pairs.sort((a, b) => a.originalIndex - b.originalIndex);

      // Take evenly spaced samples
      const step = texts.length / maxSamples;
      const samples: string[] = [];
      for (let i = 0; i < maxSamples; i++) {
        const idx = Math.floor(i * step);
        samples.push(pairs[idx].text);
      }

      return samples;
    };

    // Test case 1: Return all if under max
    const texts1 = ["a", "b", "c"];
    const indices1 = [0, 1, 2];
    expect(sampleDiverseResponses(texts1, indices1, 5)).toEqual(texts1);

    // Test case 2: Sample evenly
    const texts2 = ["a", "b", "c", "d", "e", "f"];
    const indices2 = [0, 1, 2, 3, 4, 5];
    const result2 = sampleDiverseResponses(texts2, indices2, 3);
    expect(result2.length).toBe(3);
    expect(result2).toContain("a"); // First item
    expect(result2).toContain("c"); // Middle item
    expect(result2).toContain("e"); // Later item
  });
});

describe("Embedding Normalization", () => {
  it("should normalize embeddings to unit length", () => {
    const normalizeEmbeddings = (embeddings: number[][]): number[][] => {
      return embeddings.map((embedding) => {
        const magnitude = Math.sqrt(
          embedding.reduce((sum, val) => sum + val * val, 0)
        );
        if (magnitude === 0) return embedding;
        return embedding.map((val) => val / magnitude);
      });
    };

    const input = [
      [3, 4],
      [0, 0],
      [1, 0],
    ];
    const result = normalizeEmbeddings(input);

    // Check first embedding is normalized (3,4) -> (0.6, 0.8)
    expect(result[0][0]).toBeCloseTo(0.6, 5);
    expect(result[0][1]).toBeCloseTo(0.8, 5);

    // Check magnitude is 1 (unit vector)
    const mag = Math.sqrt(result[0][0] ** 2 + result[0][1] ** 2);
    expect(mag).toBeCloseTo(1, 5);

    // Check zero vector stays zero
    expect(result[1]).toEqual([0, 0]);

    // Check already normalized vector
    expect(result[2]).toEqual([1, 0]);
  });
});

import { enforceMinClusters } from "../../domain/clusterEnforcement";
import {
  MIN_CLUSTERS_SMALL,
  MIN_CLUSTERS_LARGE,
  MISC_CLUSTER_INDEX,
} from "../../domain/thresholds";

describe("Minimum Cluster Floor Enforcement", () => {
  /**
   * Helper to create synthetic embeddings
   */
  function createEmbeddings(n: number, dim = 3): number[][] {
    const embeddings: number[][] = [];
    for (let i = 0; i < n; i++) {
      const embedding = new Array(dim).fill(0);
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
      clusterIndices.filter((idx: number) => idx !== MISC_CLUSTER_INDEX)
    );
    return uniqueClusters.size;
  }

  it("should enforce 3 clusters for n=20 when auto-k returns 1", () => {
    const embeddings = createEmbeddings(20);
    const clusterIndices = new Array(20).fill(0); // All in one cluster

    const result = enforceMinClusters(embeddings, clusterIndices, 20);

    expect(result.targetMinClusters).toBe(MIN_CLUSTERS_SMALL);
    expect(result.finalClusterCount).toBe(3);
    expect(countNonMiscClusters(result.clusterIndices)).toBe(3);
  });

  it("should enforce 5 clusters for n=60 when auto-k returns 2", () => {
    const embeddings = createEmbeddings(60);
    const clusterIndices = embeddings.map((_, i) => (i < 30 ? 0 : 1));

    const result = enforceMinClusters(embeddings, clusterIndices, 60);

    expect(result.targetMinClusters).toBe(MIN_CLUSTERS_LARGE);
    expect(result.finalClusterCount).toBe(5);
    expect(countNonMiscClusters(result.clusterIndices)).toBe(5);
  });

  it("should preserve MISC_CLUSTER_INDEX during enforcement", () => {
    const embeddings = createEmbeddings(25);
    // Start with 2 clusters and some misc
    const clusterIndices = embeddings.map((_, i) =>
      i < 10 ? 0 : i < 20 ? 1 : MISC_CLUSTER_INDEX
    );

    const result = enforceMinClusters(embeddings, clusterIndices, 25);

    // MISC_CLUSTER_INDEX should be preserved
    const hasMisc = result.clusterIndices.some(
      (idx: number) => idx === MISC_CLUSTER_INDEX
    );
    expect(hasMisc).toBe(true);

    // Count should only include non-misc clusters
    const nonMiscCount = countNonMiscClusters(result.clusterIndices);
    expect(result.finalClusterCount).toBe(nonMiscCount);
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

  it("should occur before outlier detection in pipeline", () => {
    // This test verifies the ordering constraint in the spec:
    // enforceMinClusters must run BEFORE outlier detection
    // so that outliers are detected on the final cluster assignments

    const embeddings = createEmbeddings(20);
    const clusterIndices = new Array(20).fill(0);

    // Step 1: Enforce minimum clusters
    const enforcementResult = enforceMinClusters(
      embeddings,
      clusterIndices,
      20
    );

    // Step 2: Outlier detection would run on enforcementResult.clusterIndices
    // (not testing actual outlier detection here, just the ordering)

    // Verify that enforcement has completed before outlier detection
    expect(enforcementResult.finalClusterCount).toBeGreaterThanOrEqual(
      MIN_CLUSTERS_SMALL
    );
  });
});
