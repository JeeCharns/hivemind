import { claimAnalysisJob } from "../claimAnalysisJob";
import { createMockSupabaseQuery } from "./testUtils";

describe("claimAnalysisJob", () => {
  it("claims a queued job when update returns a row", async () => {
    const { supabase, queueResult } = createMockSupabaseQuery();

    queueResult("conversation_analysis_jobs", "update", {
      data: [{ id: "job-1" }],
      error: null,
    });

    const result = await claimAnalysisJob(supabase, {
      jobId: "job-1",
      lockTtlMs: 60_000,
    });

    expect(result.claimed).toBe(true);
    if (result.claimed) {
      expect(typeof result.lockedAt).toBe("string");
    }
  });

  it("does not claim when update returns no rows", async () => {
    const { supabase, queueResult } = createMockSupabaseQuery();

    queueResult("conversation_analysis_jobs", "update", {
      data: [],
      error: null,
    });

    const result = await claimAnalysisJob(supabase, {
      jobId: "job-1",
      lockTtlMs: 60_000,
    });

    expect(result).toEqual({ claimed: false, reason: "not_queued_or_locked" });
  });
});

