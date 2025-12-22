import { computeResponseConsensusItems } from "../responseConsensus";

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

