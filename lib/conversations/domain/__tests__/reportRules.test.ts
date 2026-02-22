/**
 * Report Rules Tests
 *
 * Tests for report gating and generation logic
 */

import {
  canOpenReport,
  canGenerateReport,
  MIN_RESPONSES_FOR_REPORT,
} from "../reportRules";

describe("canOpenReport", () => {
  it("should allow when responseCount >= MIN and phase is report_open", () => {
    const result = canOpenReport("report_open", MIN_RESPONSES_FOR_REPORT);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("should allow when responseCount >= MIN and phase is closed", () => {
    const result = canOpenReport("closed", MIN_RESPONSES_FOR_REPORT);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("should disallow when responseCount < MIN", () => {
    const result = canOpenReport("report_open", MIN_RESPONSES_FOR_REPORT - 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("at least");
    expect(result.reason).toContain(String(MIN_RESPONSES_FOR_REPORT));
  });

  it("should allow with 'advance' reason when enough responses but phase not report_open", () => {
    const result = canOpenReport("understand_open", MIN_RESPONSES_FOR_REPORT);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("advance");
  });

  it("should handle exactly MIN responses", () => {
    const result = canOpenReport("report_open", MIN_RESPONSES_FOR_REPORT);
    expect(result.allowed).toBe(true);
  });

  it("should handle zero responses", () => {
    const result = canOpenReport("report_open", 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("currently 0");
  });
});

describe("canGenerateReport", () => {
  const allowedGate = { allowed: true };
  const blockedGate = { allowed: false, reason: "Not enough responses" };

  it("should return true when all conditions met", () => {
    const result = canGenerateReport(
      true, // isMember
      "understand",
      "ready",
      allowedGate
    );
    expect(result).toBe(true);
  });

  it("should return false when not a member", () => {
    const result = canGenerateReport(
      false, // not a member
      "understand",
      "ready",
      allowedGate
    );
    expect(result).toBe(false);
  });

  it("should return false when gate not allowed", () => {
    const result = canGenerateReport(true, "understand", "ready", blockedGate);
    expect(result).toBe(false);
  });

  it("should return false when type is not understand", () => {
    const result = canGenerateReport(true, "other", "ready", allowedGate);
    expect(result).toBe(false);
  });

  it("should return false when analysis not ready", () => {
    const result = canGenerateReport(
      true,
      "understand",
      "embedding",
      allowedGate
    );
    expect(result).toBe(false);
  });

  it("should return false when analysis status is null", () => {
    const result = canGenerateReport(true, "understand", null, allowedGate);
    expect(result).toBe(false);
  });

  it("should handle all conditions failing", () => {
    const result = canGenerateReport(
      false,
      "other",
      "not_started",
      blockedGate
    );
    expect(result).toBe(false);
  });
});
