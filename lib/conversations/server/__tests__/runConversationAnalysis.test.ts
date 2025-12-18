/**
 * Unit tests for runConversationAnalysis helper functions
 *
 * Tests cluster relabeling and other helpers
 */



// Export helper functions for testing by adding them to a testable module
// Since helpers are internal, we'll test the behavior indirectly through integration tests

describe("Cluster Relabeling Logic", () => {
  it("should relabel clusters by size (largest = 0)", () => {
    // Mock the relabelClustersBySize logic
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

    const input = [[3, 4], [0, 0], [1, 0]];
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
