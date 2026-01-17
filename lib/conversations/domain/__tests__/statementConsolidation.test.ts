/**
 * Tests for Statement Consolidation Domain Logic
 */

import {
  formatCombinedResponses,
  filterEligibleGroups,
  buildSynthesisContext,
  buildConsolidationOutput,
  type ConsolidationInput,
} from "../statementConsolidation";

describe("statementConsolidation", () => {
  describe("formatCombinedResponses", () => {
    it("formats single response correctly", () => {
      const responses = [{ id: "1", text: "First response" }];
      const result = formatCombinedResponses(responses);
      expect(result).toBe("1: First response");
    });

    it("formats multiple responses with pipe separator", () => {
      const responses = [
        { id: "1", text: "First response" },
        { id: "2", text: "Second response" },
        { id: "3", text: "Third response" },
      ];
      const result = formatCombinedResponses(responses);
      expect(result).toBe(
        "1: First response | 2: Second response | 3: Third response"
      );
    });

    it("handles empty array", () => {
      const result = formatCombinedResponses([]);
      expect(result).toBe("");
    });

    it("preserves special characters in text", () => {
      const responses = [
        { id: "1", text: "Response with: colon" },
        { id: "2", text: "Response with | pipe" },
      ];
      const result = formatCombinedResponses(responses);
      expect(result).toBe("1: Response with: colon | 2: Response with | pipe");
    });
  });

  describe("filterEligibleGroups", () => {
    it("filters out groups with less than 2 responses", () => {
      const groups: ConsolidationInput[] = [
        {
          groupId: "g1",
          clusterIndex: 0,
          representativeId: "1",
          responses: [{ id: "1", text: "Only one" }],
        },
        {
          groupId: "g2",
          clusterIndex: 0,
          representativeId: "2",
          responses: [
            { id: "2", text: "First" },
            { id: "3", text: "Second" },
          ],
        },
      ];

      const result = filterEligibleGroups(groups);

      expect(result).toHaveLength(1);
      expect(result[0].groupId).toBe("g2");
    });

    it("keeps groups with exactly 2 responses", () => {
      const groups: ConsolidationInput[] = [
        {
          groupId: "g1",
          clusterIndex: 0,
          representativeId: "1",
          responses: [
            { id: "1", text: "First" },
            { id: "2", text: "Second" },
          ],
        },
      ];

      const result = filterEligibleGroups(groups);
      expect(result).toHaveLength(1);
    });

    it("keeps groups with more than 2 responses", () => {
      const groups: ConsolidationInput[] = [
        {
          groupId: "g1",
          clusterIndex: 0,
          representativeId: "1",
          responses: [
            { id: "1", text: "First" },
            { id: "2", text: "Second" },
            { id: "3", text: "Third" },
            { id: "4", text: "Fourth" },
          ],
        },
      ];

      const result = filterEligibleGroups(groups);
      expect(result).toHaveLength(1);
      expect(result[0].responses).toHaveLength(4);
    });

    it("returns empty array when all groups are too small", () => {
      const groups: ConsolidationInput[] = [
        {
          groupId: "g1",
          clusterIndex: 0,
          representativeId: "1",
          responses: [{ id: "1", text: "Only one" }],
        },
        {
          groupId: "g2",
          clusterIndex: 1,
          representativeId: "2",
          responses: [],
        },
      ];

      const result = filterEligibleGroups(groups);
      expect(result).toHaveLength(0);
    });

    it("handles empty input array", () => {
      const result = filterEligibleGroups([]);
      expect(result).toHaveLength(0);
    });
  });

  describe("buildSynthesisContext", () => {
    it("extracts response texts and cluster index", () => {
      const group: ConsolidationInput = {
        groupId: "g1",
        clusterIndex: 2,
        representativeId: "1",
        responses: [
          { id: "1", text: "First response" },
          { id: "2", text: "Second response" },
        ],
      };

      const result = buildSynthesisContext(group);

      expect(result.clusterIndex).toBe(2);
      expect(result.responses).toEqual(["First response", "Second response"]);
    });

    it("handles empty responses array", () => {
      const group: ConsolidationInput = {
        groupId: "g1",
        clusterIndex: 0,
        representativeId: "1",
        responses: [],
      };

      const result = buildSynthesisContext(group);

      expect(result.clusterIndex).toBe(0);
      expect(result.responses).toEqual([]);
    });
  });

  describe("buildConsolidationOutput", () => {
    it("builds complete output with all fields", () => {
      const group: ConsolidationInput = {
        groupId: "group-123",
        clusterIndex: 1,
        representativeId: "r1",
        responses: [
          { id: "r1", text: "First response" },
          { id: "r2", text: "Second response" },
        ],
      };
      const synthesizedStatement = "Combined: both responses agree on X";

      const result = buildConsolidationOutput(group, synthesizedStatement);

      expect(result.groupId).toBe("group-123");
      expect(result.synthesizedStatement).toBe(
        "Combined: both responses agree on X"
      );
      expect(result.combinedResponseIds).toEqual(["r1", "r2"]);
      expect(result.combinedResponses).toBe(
        "r1: First response | r2: Second response"
      );
    });

    it("preserves group ID correctly", () => {
      const group: ConsolidationInput = {
        groupId: "uuid-formatted-group-id",
        clusterIndex: 0,
        representativeId: "1",
        responses: [{ id: "1", text: "Response" }],
      };

      const result = buildConsolidationOutput(group, "Synthesized");

      expect(result.groupId).toBe("uuid-formatted-group-id");
    });
  });
});
