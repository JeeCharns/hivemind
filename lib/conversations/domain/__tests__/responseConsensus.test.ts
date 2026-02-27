import {
  computeResponseConsensusItems,
  computeConsolidatedConsensusItems,
} from "../responseConsensus";

describe("computeResponseConsensusItems", () => {
  it("computes vote totals and percentages for all responses with votes", () => {
    const responses = [
      { id: "a", responseText: "A" },
      { id: "b", responseText: "B" },
      { id: "c", responseText: "C" },
    ];

    const feedbackRows = [
      { responseId: "a", feedback: "agree" },
      { responseId: "a", feedback: "agree" },
      { responseId: "a", feedback: "disagree" },
      { responseId: "b", feedback: "pass" },
      { responseId: "b", feedback: "banana" }, // ignored
    ];

    const items = computeResponseConsensusItems(responses, feedbackRows);

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "a",
          agreeVotes: 2,
          disagreeVotes: 1,
          passVotes: 0,
          totalVotes: 3,
        }),
        expect.objectContaining({
          id: "b",
          agreeVotes: 0,
          disagreeVotes: 0,
          passVotes: 1,
          totalVotes: 1,
        }),
      ])
    );

    expect(items.find((i) => i.id === "c")).toBeUndefined();
  });
});

describe("computeConsolidatedConsensusItems", () => {
  it("counts only votes on the representative (first) response in a bucket", () => {
    const buckets = [
      {
        bucketId: "bucket-1",
        consolidatedStatement: "People support UBI",
        responseIds: ["r1", "r2", "r3"],
      },
    ];

    const unconsolidatedResponses: {
      responseId: string;
      responseText: string;
    }[] = [];

    // Votes on r2 and r3 should NOT be counted - only r1 (the representative)
    const feedbackRows = [
      { responseId: "r1", feedback: "agree" },
      { responseId: "r1", feedback: "agree" },
      { responseId: "r1", feedback: "disagree" },
      { responseId: "r2", feedback: "agree" }, // should be ignored
      { responseId: "r3", feedback: "pass" }, // should be ignored
    ];

    const items = computeConsolidatedConsensusItems(
      buckets,
      unconsolidatedResponses,
      feedbackRows
    );

    expect(items).toHaveLength(1);
    // Only counts votes on r1 (the representative): 2 agree, 1 disagree
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "bucket-1",
        responseText: "People support UBI",
        agreeVotes: 2,
        disagreeVotes: 1,
        passVotes: 0,
        totalVotes: 3,
        agreePercent: 67,
        disagreePercent: 33,
        passPercent: 0,
      })
    );
  });

  it("includes unconsolidated responses as individual items", () => {
    const buckets = [
      {
        bucketId: "bucket-1",
        consolidatedStatement: "Consolidated statement",
        responseIds: ["r1"],
      },
    ];

    const unconsolidatedResponses = [
      { responseId: "r2", responseText: "Unique response" },
    ];

    const feedbackRows = [
      { responseId: "r1", feedback: "agree" },
      { responseId: "r2", feedback: "disagree" },
      { responseId: "r2", feedback: "disagree" },
    ];

    const items = computeConsolidatedConsensusItems(
      buckets,
      unconsolidatedResponses,
      feedbackRows
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "bucket-1",
        responseText: "Consolidated statement",
      })
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        id: "r2",
        responseText: "Unique response",
        disagreeVotes: 2,
        totalVotes: 2,
      })
    );
  });

  it("includes buckets and responses with no votes at the end", () => {
    const buckets = [
      {
        bucketId: "bucket-1",
        consolidatedStatement: "No votes here",
        responseIds: ["r1"],
      },
    ];

    const unconsolidatedResponses = [
      { responseId: "r2", responseText: "Also no votes" },
    ];

    const feedbackRows: { responseId: string; feedback: string }[] = [];

    const items = computeConsolidatedConsensusItems(
      buckets,
      unconsolidatedResponses,
      feedbackRows
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "bucket-1",
        responseText: "No votes here",
        totalVotes: 0,
        agreePercent: 0,
        passPercent: 0,
        disagreePercent: 0,
      })
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        id: "r2",
        responseText: "Also no votes",
        totalVotes: 0,
      })
    );
  });

  it("places voted items before unvoted items", () => {
    const buckets = [
      {
        bucketId: "bucket-unvoted",
        consolidatedStatement: "Unvoted bucket",
        responseIds: ["r1"],
      },
      {
        bucketId: "bucket-voted",
        consolidatedStatement: "Voted bucket",
        responseIds: ["r2"],
      },
    ];

    const unconsolidatedResponses = [
      { responseId: "r3", responseText: "Unvoted response" },
    ];

    const feedbackRows = [{ responseId: "r2", feedback: "agree" }];

    const items = computeConsolidatedConsensusItems(
      buckets,
      unconsolidatedResponses,
      feedbackRows
    );

    expect(items).toHaveLength(3);
    // Voted item should be first
    expect(items[0].id).toBe("bucket-voted");
    expect(items[0].totalVotes).toBe(1);
    // Unvoted items should be at the end
    expect(items[1].id).toBe("bucket-unvoted");
    expect(items[1].totalVotes).toBe(0);
    expect(items[2].id).toBe("r3");
    expect(items[2].totalVotes).toBe(0);
  });

  describe("ordering by responseCount", () => {
    it("should sort unvoted buckets by responseCount descending", () => {
      const buckets = [
        {
          bucketId: "small",
          consolidatedStatement: "Small",
          responseIds: ["r1", "r2"],
        },
        {
          bucketId: "large",
          consolidatedStatement: "Large",
          responseIds: ["r3", "r4", "r5", "r6", "r7"],
        },
        {
          bucketId: "medium",
          consolidatedStatement: "Medium",
          responseIds: ["r8", "r9", "r10"],
        },
      ];
      const result = computeConsolidatedConsensusItems(buckets, [], []);

      expect(result[0].id).toBe("large"); // 5 responses
      expect(result[1].id).toBe("medium"); // 3 responses
      expect(result[2].id).toBe("small"); // 2 responses
    });

    it("should put voted items first, then unvoted sorted by responseCount", () => {
      const buckets = [
        {
          bucketId: "small-voted",
          consolidatedStatement: "Small voted",
          responseIds: ["r1"],
        },
        {
          bucketId: "large-unvoted",
          consolidatedStatement: "Large unvoted",
          responseIds: ["r2", "r3", "r4", "r5"],
        },
        {
          bucketId: "medium-unvoted",
          consolidatedStatement: "Medium unvoted",
          responseIds: ["r6", "r7"],
        },
      ];
      const feedbackRows = [{ responseId: "r1", feedback: "agree" }];

      const result = computeConsolidatedConsensusItems(
        buckets,
        [],
        feedbackRows
      );

      expect(result[0].id).toBe("small-voted"); // voted first
      expect(result[1].id).toBe("large-unvoted"); // 4 responses
      expect(result[2].id).toBe("medium-unvoted"); // 2 responses
    });

    it("should sort unconsolidated responses by responseCount (always 1) after buckets", () => {
      const buckets = [
        {
          bucketId: "bucket-large",
          consolidatedStatement: "Large bucket",
          responseIds: ["r1", "r2", "r3"],
        },
      ];
      const unconsolidatedResponses = [
        { responseId: "r4", responseText: "Single response 1" },
        { responseId: "r5", responseText: "Single response 2" },
      ];

      const result = computeConsolidatedConsensusItems(
        buckets,
        unconsolidatedResponses,
        []
      );

      // Bucket with 3 responses should be first, then single responses
      expect(result[0].id).toBe("bucket-large");
      expect(result[1].id).toBe("r4");
      expect(result[2].id).toBe("r5");
    });
  });
});
