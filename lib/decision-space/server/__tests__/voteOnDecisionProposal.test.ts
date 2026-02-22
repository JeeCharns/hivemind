// lib/decision-space/server/__tests__/voteOnDecisionProposal.test.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { voteOnDecisionProposal } from "../voteOnDecisionProposal";

const mockSupabase = {
  rpc: jest.fn(),
};

describe("voteOnDecisionProposal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls RPC and returns result on success", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { success: true, new_votes: 2, remaining_credits: 95 },
      error: null,
    });

    const result = await voteOnDecisionProposal(
      mockSupabase as unknown as SupabaseClient,
      "user-1",
      {
        roundId: "round-1",
        proposalId: "prop-1",
        delta: 1,
      }
    );

    expect(result.success).toBe(true);
    expect(result.newVotes).toBe(2);
    expect(result.remainingCredits).toBe(95);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("vote_on_decision_proposal", {
      p_round_id: "round-1",
      p_proposal_id: "prop-1",
      p_user_id: "user-1",
      p_delta: 1,
    });
  });

  it("returns error when budget exceeded", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: {
        success: false,
        error_code: "BUDGET_EXCEEDED",
        remaining_credits: 3,
      },
      error: null,
    });

    const result = await voteOnDecisionProposal(
      mockSupabase as unknown as SupabaseClient,
      "user-1",
      {
        roundId: "round-1",
        proposalId: "prop-1",
        delta: 1,
      }
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("BUDGET_EXCEEDED");
    expect(result.remainingCredits).toBe(3);
  });

  it("throws on RPC error", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: "Database error" },
    });

    await expect(
      voteOnDecisionProposal(
        mockSupabase as unknown as SupabaseClient,
        "user-1",
        {
          roundId: "round-1",
          proposalId: "prop-1",
          delta: 1,
        }
      )
    ).rejects.toThrow("Failed to record vote");
  });

  it("throws when RPC returns no data", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(
      voteOnDecisionProposal(
        mockSupabase as unknown as SupabaseClient,
        "user-1",
        {
          roundId: "round-1",
          proposalId: "prop-1",
          delta: 1,
        }
      )
    ).rejects.toThrow("No response from vote RPC");
  });
});
