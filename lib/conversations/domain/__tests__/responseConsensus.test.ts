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
  it("aggregates feedback from all responses in a bucket", () => {
    const buckets = [
      {
        bucketId: "bucket-1",
        consolidatedStatement: "People support UBI",
        responseIds: ["r1", "r2", "r3"],
      },
    ];

    const unconsolidatedResponses: { responseId: string; responseText: string }[] = [];

    const feedbackRows = [
      { responseId: "r1", feedback: "agree" },
      { responseId: "r1", feedback: "agree" },
      { responseId: "r2", feedback: "agree" },
      { responseId: "r2", feedback: "disagree" },
      { responseId: "r3", feedback: "pass" },
    ];

    const items = computeConsolidatedConsensusItems(
      buckets,
      unconsolidatedResponses,
      feedbackRows
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "bucket-1",
        responseText: "People support UBI",
        agreeVotes: 3,
        disagreeVotes: 1,
        passVotes: 1,
        totalVotes: 5,
        agreePercent: 60,
        disagreePercent: 20,
        passPercent: 20,
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
});

