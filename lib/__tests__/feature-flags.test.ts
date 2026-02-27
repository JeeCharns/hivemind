import { FEATURE_FLAGS } from "../feature-flags";

describe("FEATURE_FLAGS", () => {
  it("should have ENABLE_CONSENSUS_THRESHOLD set to false", () => {
    expect(FEATURE_FLAGS.ENABLE_CONSENSUS_THRESHOLD).toBe(false);
  });

  it("should be a frozen object", () => {
    expect(Object.isFrozen(FEATURE_FLAGS)).toBe(true);
  });
});
