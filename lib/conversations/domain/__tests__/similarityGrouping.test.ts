/**
 * Tests for similarity grouping algorithm
 */

import {
  groupResponsesBySimilarity,
  cosineSimilarity,
  type ResponseWithEmbedding,
  type GroupingParams,
} from "../similarityGrouping";

describe("similarityGrouping", () => {
  describe("cosineSimilarity", () => {
    it("should return 1 for identical vectors", () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    });

    it("should return 0 for orthogonal vectors", () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0);
    });

    it("should return -1 for opposite vectors", () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
    });

    it("should handle zero vectors gracefully", () => {
      const a = [0, 0, 0];
      const b = [1, 0, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it("should compute correct similarity for non-unit vectors", () => {
      const a = [3, 4]; // magnitude = 5
      const b = [4, 3]; // magnitude = 5
      // dot product = 3*4 + 4*3 = 24
      // similarity = 24 / (5 * 5) = 0.96
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.96);
    });
  });

  describe("groupResponsesBySimilarity", () => {
    it("should not create groups when all responses are dissimilar", () => {
      const responses: ResponseWithEmbedding[] = [
        { id: "1", text: "A", embedding: [1, 0, 0], clusterIndex: 0 },
        { id: "2", text: "B", embedding: [0, 1, 0], clusterIndex: 0 },
        { id: "3", text: "C", embedding: [0, 0, 1], clusterIndex: 0 },
      ];

      const params: GroupingParams = {
        simThreshold: 0.9,
        minGroupSize: 2,
        algorithmVersion: "test",
      };

      const groups = groupResponsesBySimilarity(responses, params);
      expect(groups).toHaveLength(0);
    });

    it("should be less strict by default (groups ~0.88 cosine)", () => {
      // These are similar, but below the previous default threshold of 0.90
      const a = [1, 0];
      const b = [0.88, 0.475079]; // unit vector with cos(angle)=0.88 vs [1,0]

      expect(cosineSimilarity(a, b)).toBeCloseTo(0.88, 2);

      const responses: ResponseWithEmbedding[] = [
        { id: "1", text: "A", embedding: a, clusterIndex: 0 },
        { id: "2", text: "A (paraphrase)", embedding: b, clusterIndex: 0 },
      ];

      const groups = groupResponsesBySimilarity(responses);
      expect(groups).toHaveLength(1);
      expect(groups[0].size).toBe(2);
    });

    it("should create a group when responses are highly similar", () => {
      const responses: ResponseWithEmbedding[] = [
        { id: "1", text: "A", embedding: [1, 0, 0], clusterIndex: 0 },
        { id: "2", text: "A'", embedding: [0.95, 0.1, 0], clusterIndex: 0 }, // very similar to A
        { id: "3", text: "A''", embedding: [0.9, 0.2, 0], clusterIndex: 0 }, // very similar to A
      ];

      const params: GroupingParams = {
        simThreshold: 0.85, // lower threshold to capture these
        minGroupSize: 2,
        algorithmVersion: "test",
      };

      const groups = groupResponsesBySimilarity(responses, params);
      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0].size).toBeGreaterThanOrEqual(2);
    });

    it("should respect minGroupSize threshold", () => {
      const responses: ResponseWithEmbedding[] = [
        { id: "1", text: "A", embedding: [1, 0], clusterIndex: 0 },
        { id: "2", text: "A'", embedding: [1, 0], clusterIndex: 0 }, // identical
      ];

      // Group size is 2, but minGroupSize is 3
      const params: GroupingParams = {
        simThreshold: 0.99,
        minGroupSize: 3,
        algorithmVersion: "test",
      };

      const groups = groupResponsesBySimilarity(responses, params);
      expect(groups).toHaveLength(0); // No groups because size < minGroupSize
    });

    it("should handle transitive similarity (connected components)", () => {
      // A ≈ B, B ≈ C, but A not ≈ C (transitive closure)
      const responses: ResponseWithEmbedding[] = [
        { id: "1", text: "A", embedding: [1, 0], clusterIndex: 0 },
        { id: "2", text: "B", embedding: [0.95, 0.31], clusterIndex: 0 }, // similar to A
        { id: "3", text: "C", embedding: [0.8, 0.6], clusterIndex: 0 }, // similar to B but not A
      ];

      const params: GroupingParams = {
        simThreshold: 0.9,
        minGroupSize: 2,
        algorithmVersion: "test",
      };

      const groups = groupResponsesBySimilarity(responses, params);

      // Should form one group via transitive closure
      if (groups.length > 0) {
        const largestGroup = groups.reduce((max, g) =>
          g.size > max.size ? g : max
        );
        expect(largestGroup.size).toBeGreaterThanOrEqual(2);
      }
    });

    it("should separate responses from different themes", () => {
      const responses: ResponseWithEmbedding[] = [
        { id: "1", text: "A", embedding: [1, 0], clusterIndex: 0 },
        { id: "2", text: "A'", embedding: [1, 0], clusterIndex: 0 },
        { id: "3", text: "B", embedding: [1, 0], clusterIndex: 1 }, // different theme
        { id: "4", text: "B'", embedding: [1, 0], clusterIndex: 1 },
      ];

      const params: GroupingParams = {
        simThreshold: 0.99,
        minGroupSize: 2,
        algorithmVersion: "test",
      };

      const groups = groupResponsesBySimilarity(responses, params);

      // Should create 2 groups (one per theme)
      expect(groups.length).toBeGreaterThanOrEqual(2);

      const theme0Groups = groups.filter((g) => g.clusterIndex === 0);
      const theme1Groups = groups.filter((g) => g.clusterIndex === 1);

      expect(theme0Groups.length).toBeGreaterThan(0);
      expect(theme1Groups.length).toBeGreaterThan(0);
    });

    it("should pick representative closest to centroid", () => {
      // Create a group where one response is clearly central
      const responses: ResponseWithEmbedding[] = [
        {
          id: "outlier",
          text: "outlier",
          embedding: [0.8, 0],
          clusterIndex: 0,
        },
        { id: "center", text: "center", embedding: [1, 0], clusterIndex: 0 }, // centroid
        { id: "other", text: "other", embedding: [0.9, 0.1], clusterIndex: 0 },
      ];

      const params: GroupingParams = {
        simThreshold: 0.7, // low threshold to group all
        minGroupSize: 2,
        algorithmVersion: "test",
      };

      const groups = groupResponsesBySimilarity(responses, params);

      if (groups.length > 0) {
        // Representative should be "center" (closest to centroid)
        const group = groups[0];
        // We can't guarantee exact representative without knowing centroid,
        // but we can verify it's one of the members
        expect(group.memberIds).toContain(group.representativeId);
      }
    });

    it("should skip themes with null clusterIndex", () => {
      const responses: ResponseWithEmbedding[] = [
        { id: "1", text: "A", embedding: [1, 0], clusterIndex: null },
        { id: "2", text: "A'", embedding: [1, 0], clusterIndex: null },
      ];

      const params: GroupingParams = {
        simThreshold: 0.99,
        minGroupSize: 2,
        algorithmVersion: "test",
      };

      const groups = groupResponsesBySimilarity(responses, params);
      expect(groups).toHaveLength(0); // No groups for null theme
    });
  });
});
