import { computeAgreementSummaries } from "../agreementSummaries";

describe("computeAgreementSummaries", () => {
  it("returns agreement and divisive summaries based on feedback", () => {
    const responses = [
      { id: "a", responseText: "Strong agreement" },
      { id: "b", responseText: "Divisive" },
      { id: "c", responseText: "Too few votes" },
    ];

    const feedbackRows = [
      // a: 8 agree, 1 pass, 1 disagree => 80% agree
      ...Array.from({ length: 8 }, () => ({
        responseId: "a",
        feedback: "agree",
      })),
      { responseId: "a", feedback: "pass" },
      { responseId: "a", feedback: "disagree" },

      // b: 5 agree, 5 disagree => 50/50
      ...Array.from({ length: 5 }, () => ({
        responseId: "b",
        feedback: "agree",
      })),
      ...Array.from({ length: 5 }, () => ({
        responseId: "b",
        feedback: "disagree",
      })),

      // c: 2 agree => ignored by minVotes
      { responseId: "c", feedback: "agree" },
      { responseId: "c", feedback: "agree" },
    ];

    const summaries = computeAgreementSummaries(responses, feedbackRows, {
      minVotes: 5,
      maxPerType: 5,
    });

    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "a",
          type: "agreement",
          agreePercent: 80,
          totalVotes: 10,
        }),
        expect.objectContaining({
          id: "b",
          type: "divisive",
          agreePercent: 50,
          totalVotes: 10,
        }),
      ])
    );

    expect(summaries.find((s) => s.id === "c")).toBeUndefined();
  });

  it("ignores unknown feedback values", () => {
    const responses = [{ id: "a", responseText: "Text" }];
    const feedbackRows = [
      { responseId: "a", feedback: "agree" },
      { responseId: "a", feedback: "banana" },
      { responseId: "a", feedback: "disagree" },
      { responseId: "a", feedback: "pass" },
      { responseId: "a", feedback: "agree" },
    ];

    const summaries = computeAgreementSummaries(responses, feedbackRows, {
      minVotes: 1,
      agreementAgreePercentMin: 0,
      maxPerType: 10,
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.totalVotes).toBe(4);
  });
});
