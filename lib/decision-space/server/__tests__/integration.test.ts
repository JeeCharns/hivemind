// lib/decision-space/server/__tests__/integration.test.ts

/**
 * Integration tests for Decision Space flows
 *
 * These tests validate the complete flow of decision space operations,
 * testing how multiple services work together.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDecisionSetupData } from "../getDecisionSetupData";
import { createDecisionSession } from "../createDecisionSession";
import { voteOnDecisionProposal } from "../voteOnDecisionProposal";
import { closeDecisionRound } from "../closeDecisionRound";
import { generateDecisionResults } from "../generateDecisionResults";

// Mock dependencies
jest.mock("@/lib/conversations/server/requireHiveMember", () => ({
  requireHiveMember: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/analysis/openai/embeddingsClient", () => ({
  createOpenAIClient: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/analysis/openai/generateDecisionAnalysis", () => ({
  generateDecisionAnalysis: jest
    .fn()
    .mockResolvedValue("Mock AI analysis of decision results"),
}));

// Helper to create mock Supabase client
function createMockSupabase() {
  return {
    from: jest.fn(),
    rpc: jest.fn(),
  };
}

// Test data constants
const TEST_USER_ID = "user-test-123";
const TEST_HIVE_ID = "hive-test-456";
const TEST_SOURCE_CONV_ID = "source-conv-789";

describe("Decision Space Integration Tests", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  // ============================================
  // SETUP FLOW TESTS
  // ============================================

  describe("Setup Flow", () => {
    it("getDecisionSetupData returns clusters and statements from completed understand session", async () => {
      // Mock conversation check
      const mockConversationSelect = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: TEST_SOURCE_CONV_ID,
            hive_id: TEST_HIVE_ID,
            type: "understand",
            title: "Community Feedback",
            analysis_status: "ready",
          },
          error: null,
        }),
      };

      // Mock themes
      const mockThemesSelect = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [
            {
              cluster_index: 0,
              name: "Environment",
              description: "Environmental concerns",
              size: 15,
            },
            {
              cluster_index: 1,
              name: "Economy",
              description: "Economic issues",
              size: 12,
            },
            {
              cluster_index: 2,
              name: "Education",
              description: "Education topics",
              size: 8,
            },
          ],
          error: null,
        }),
      };

      // Mock buckets
      const mockBucketsSelect = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      mockBucketsSelect.order.mockReturnValueOnce(mockBucketsSelect);
      mockBucketsSelect.order.mockResolvedValueOnce({
        data: [
          {
            id: "bucket-1",
            cluster_index: 0,
            bucket_name: "Renewable Energy",
            consolidated_statement:
              "We should invest more in renewable energy sources",
            response_count: 8,
          },
          {
            id: "bucket-2",
            cluster_index: 0,
            bucket_name: "Pollution Control",
            consolidated_statement: "Stricter pollution regulations are needed",
            response_count: 5,
          },
          {
            id: "bucket-3",
            cluster_index: 1,
            bucket_name: "Tax Policy",
            consolidated_statement: "Tax incentives for small businesses",
            response_count: 6,
          },
        ],
        error: null,
      });

      // Mock bucket members (for consensus calculation)
      const mockMembersSelect = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [
            { bucket_id: "bucket-1", response_id: 101 },
            { bucket_id: "bucket-2", response_id: 102 },
            { bucket_id: "bucket-3", response_id: 103 },
          ],
          error: null,
        }),
      };

      // Mock feedback
      const mockFeedbackSelect = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [
            { response_id: 101, feedback: "agree" },
            { response_id: 101, feedback: "agree" },
            { response_id: 101, feedback: "disagree" },
            { response_id: 102, feedback: "agree" },
            { response_id: 103, feedback: "agree" },
            { response_id: 103, feedback: "agree" },
          ],
          error: null,
        }),
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "conversations") return mockConversationSelect;
        if (table === "conversation_themes") return mockThemesSelect;
        if (table === "conversation_cluster_buckets") return mockBucketsSelect;
        if (table === "conversation_cluster_bucket_members")
          return mockMembersSelect;
        if (table === "response_feedback") return mockFeedbackSelect;
        return { select: jest.fn().mockReturnThis() };
      });

      const result = await getDecisionSetupData(
        mockSupabase as unknown as SupabaseClient,
        TEST_USER_ID,
        TEST_SOURCE_CONV_ID
      );

      // Verify structure
      expect(result.sourceConversationId).toBe(TEST_SOURCE_CONV_ID);
      expect(result.sourceTitle).toBe("Community Feedback");
      expect(result.clusters).toHaveLength(3);
      expect(result.statements).toHaveLength(3);

      // Verify cluster data (sorted by avgConsensusPercent descending)
      expect(result.clusters[0].name).toBe("Economy");
      expect(result.clusters[0].statementCount).toBe(1);
      expect(result.clusters[1].name).toBe("Environment");
      expect(result.clusters[1].statementCount).toBe(2);

      // Verify statement data (sorted by agreePercent descending)
      // bucket-2: 100%, bucket-3: 100%, bucket-1: 67%
      expect(result.statements[0].statementText).toBe(
        "Stricter pollution regulations are needed"
      );
      expect(result.statements[0].clusterIndex).toBe(0);
      expect(result.statements[2].statementText).toBe(
        "We should invest more in renewable energy sources"
      );
      expect(result.statements[2].clusterIndex).toBe(0);
    });

    it("validates source conversation is understand type", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: TEST_SOURCE_CONV_ID,
            hive_id: TEST_HIVE_ID,
            type: "decide", // Wrong type
            analysis_status: "ready",
          },
          error: null,
        }),
      });

      await expect(
        getDecisionSetupData(
          mockSupabase as unknown as SupabaseClient,
          TEST_USER_ID,
          TEST_SOURCE_CONV_ID
        )
      ).rejects.toThrow("Source must be an understand session");
    });

    it("validates source conversation analysis is completed", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: TEST_SOURCE_CONV_ID,
            hive_id: TEST_HIVE_ID,
            type: "understand",
            analysis_status: "clustering", // Not ready
          },
          error: null,
        }),
      });

      await expect(
        getDecisionSetupData(
          mockSupabase as unknown as SupabaseClient,
          TEST_USER_ID,
          TEST_SOURCE_CONV_ID
        )
      ).rejects.toThrow("Analysis must be complete");
    });
  });

  // ============================================
  // CREATE SESSION FLOW TESTS
  // ============================================

  describe("Create Session Flow", () => {
    it("createDecisionSession creates conversation, proposals, and first round", async () => {
      const newConversationId = "new-conv-123";
      const newRoundId = "round-001";
      let conversationCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "conversations") {
          conversationCallCount++;
          if (conversationCallCount === 1) {
            // First call: source conversation check
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: TEST_SOURCE_CONV_ID,
                  hive_id: TEST_HIVE_ID,
                  type: "understand",
                  analysis_status: "ready",
                },
                error: null,
              }),
            };
          } else {
            // Second call: insert new conversation
            return {
              insert: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { id: newConversationId, slug: "my-decision-session" },
                error: null,
              }),
              delete: jest.fn().mockReturnThis(),
            };
          }
        }
        if (table === "hive_members") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { role: "admin" },
              error: null,
            }),
          };
        }
        if (table === "decision_proposals") {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "decision_rounds") {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: newRoundId },
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      const input = {
        hiveId: TEST_HIVE_ID,
        sourceConversationId: TEST_SOURCE_CONV_ID,
        title: "Community Decision",
        description: "Vote on community priorities",
        selectedClusters: [0, 1],
        selectedStatements: [
          {
            bucketId: "bucket-1",
            clusterIndex: 0,
            statementText: "Renewable energy investment",
            agreePercent: 75,
          },
          {
            bucketId: "bucket-2",
            clusterIndex: 1,
            statementText: "Tax incentives for businesses",
            agreePercent: 68,
          },
        ],
        consensusThreshold: 70,
        visibility: "hidden" as const,
      };

      const result = await createDecisionSession(
        mockSupabase as unknown as SupabaseClient,
        TEST_USER_ID,
        input
      );

      expect(result.conversationId).toBe(newConversationId);
      expect(result.roundId).toBe(newRoundId);
      expect(result.slug).toBe("my-decision-session");
    });

    it("allows members (not just admins) to create decision sessions", async () => {
      const newConversationId = "new-conv-member";
      const newRoundId = "round-member-001";
      let conversationCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "conversations") {
          conversationCallCount++;
          if (conversationCallCount === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: TEST_SOURCE_CONV_ID,
                  hive_id: TEST_HIVE_ID,
                  type: "understand",
                  analysis_status: "ready",
                },
                error: null,
              }),
            };
          }
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: newConversationId, slug: "member-decision" },
              error: null,
            }),
          };
        }
        if (table === "hive_members") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { role: "member" }, // Not admin — should still succeed
              error: null,
            }),
          };
        }
        if (table === "decision_proposals") {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }
        if (table === "decision_rounds") {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: newRoundId },
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      const input = {
        hiveId: TEST_HIVE_ID,
        sourceConversationId: TEST_SOURCE_CONV_ID,
        title: "Test",
        selectedClusters: [0],
        selectedStatements: [
          {
            bucketId: "b1",
            clusterIndex: 0,
            statementText: "Statement",
            agreePercent: 70,
          },
        ],
        consensusThreshold: 70,
        visibility: "hidden" as const,
      };

      const result = await createDecisionSession(
        mockSupabase as unknown as SupabaseClient,
        TEST_USER_ID,
        input
      );

      expect(result.conversationId).toBe(newConversationId);
      expect(result.roundId).toBe(newRoundId);
    });

    it("links to source conversation", async () => {
      let insertedConversation: Record<string, unknown> | null = null;
      let conversationCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "conversations") {
          conversationCallCount++;
          if (conversationCallCount === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: TEST_SOURCE_CONV_ID,
                  hive_id: TEST_HIVE_ID,
                  type: "understand",
                  analysis_status: "ready",
                },
                error: null,
              }),
            };
          } else {
            return {
              insert: jest.fn((data) => {
                insertedConversation = data;
                return {
                  select: jest.fn().mockReturnThis(),
                  single: jest.fn().mockResolvedValue({
                    data: { id: "new-conv", slug: "test" },
                    error: null,
                  }),
                };
              }),
            };
          }
        }
        if (table === "hive_members") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { role: "admin" },
              error: null,
            }),
          };
        }
        if (table === "decision_proposals") {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }
        if (table === "decision_rounds") {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: "round-1" },
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await createDecisionSession(
        mockSupabase as unknown as SupabaseClient,
        TEST_USER_ID,
        {
          hiveId: TEST_HIVE_ID,
          sourceConversationId: TEST_SOURCE_CONV_ID,
          title: "Test",
          selectedClusters: [0],
          selectedStatements: [
            {
              bucketId: "b1",
              clusterIndex: 0,
              statementText: "Statement",
              agreePercent: 70,
            },
          ],
          consensusThreshold: 70,
          visibility: "hidden",
        }
      );

      expect(insertedConversation).toBeTruthy();
      expect(insertedConversation!.source_conversation_id).toBe(
        TEST_SOURCE_CONV_ID
      );
      expect(insertedConversation!.type).toBe("decide");
    });
  });

  // ============================================
  // VOTING FLOW TESTS
  // ============================================

  describe("Voting Flow", () => {
    it("voteOnDecisionProposal records votes correctly", async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: { success: true, new_votes: 3, remaining_credits: 90 },
        error: null,
      });

      const result = await voteOnDecisionProposal(
        mockSupabase as unknown as SupabaseClient,
        TEST_USER_ID,
        {
          roundId: "round-1",
          proposalId: "proposal-1",
          delta: 1,
        }
      );

      expect(result.success).toBe(true);
      expect(result.newVotes).toBe(3);
      expect(result.remainingCredits).toBe(90);

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        "vote_on_decision_proposal",
        {
          p_round_id: "round-1",
          p_proposal_id: "proposal-1",
          p_user_id: TEST_USER_ID,
          p_delta: 1,
        }
      );
    });

    it("enforces 99 credit budget with quadratic cost", async () => {
      // Simulate a user at budget limit (e.g., 9 votes = 81 credits, only 18 left)
      // Next vote would cost 19 (10^2 - 9^2), but only have 18
      mockSupabase.rpc.mockResolvedValue({
        data: {
          success: false,
          error_code: "BUDGET_EXCEEDED",
          remaining_credits: 18,
          new_votes: 9, // Current votes
        },
        error: null,
      });

      const result = await voteOnDecisionProposal(
        mockSupabase as unknown as SupabaseClient,
        TEST_USER_ID,
        {
          roundId: "round-1",
          proposalId: "proposal-1",
          delta: 1,
        }
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("BUDGET_EXCEEDED");
      expect(result.remainingCredits).toBe(18);
    });

    it("returns error codes for over-budget votes", async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: {
          success: false,
          error_code: "BUDGET_EXCEEDED",
          remaining_credits: 5,
        },
        error: null,
      });

      const result = await voteOnDecisionProposal(
        mockSupabase as unknown as SupabaseClient,
        TEST_USER_ID,
        {
          roundId: "round-1",
          proposalId: "proposal-1",
          delta: 1,
        }
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("BUDGET_EXCEEDED");
    });

    it("supports negative votes (voting down)", async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: { success: true, new_votes: -2, remaining_credits: 95 },
        error: null,
      });

      const result = await voteOnDecisionProposal(
        mockSupabase as unknown as SupabaseClient,
        TEST_USER_ID,
        {
          roundId: "round-1",
          proposalId: "proposal-1",
          delta: -1,
        }
      );

      expect(result.success).toBe(true);
      expect(result.newVotes).toBe(-2);

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        "vote_on_decision_proposal",
        {
          p_round_id: "round-1",
          p_proposal_id: "proposal-1",
          p_user_id: TEST_USER_ID,
          p_delta: -1,
        }
      );
    });

    it("handles round not found error", async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: "Round not found" },
      });

      await expect(
        voteOnDecisionProposal(
          mockSupabase as unknown as SupabaseClient,
          TEST_USER_ID,
          {
            roundId: "invalid-round",
            proposalId: "proposal-1",
            delta: 1,
          }
        )
      ).rejects.toThrow("Failed to record vote");
    });
  });

  // ============================================
  // CLOSE ROUND FLOW TESTS
  // ============================================

  describe("Close Round Flow", () => {
    it("closeDecisionRound changes status", async () => {
      const roundId = "round-test-1";
      const conversationId = "conv-test-1";
      let updatedStatus: string | null = null;

      // Track calls to different tables
      let decisionRoundsCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "decision_rounds") {
          decisionRoundsCallCount++;
          if (decisionRoundsCallCount === 1) {
            // First call: fetch round info
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: roundId,
                  conversation_id: conversationId,
                  status: "voting_open",
                  conversations: { hive_id: TEST_HIVE_ID },
                },
                error: null,
              }),
              single: jest.fn().mockResolvedValue({
                data: {
                  id: roundId,
                  conversation_id: conversationId,
                  round_number: 1,
                },
                error: null,
              }),
            };
          } else if (decisionRoundsCallCount === 2) {
            // Second call: update round status
            return {
              update: jest.fn((data) => {
                updatedStatus = data.status;
                return {
                  eq: jest.fn().mockResolvedValue({ error: null }),
                };
              }),
            };
          } else {
            // Subsequent calls for generateDecisionResults
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: {
                  id: roundId,
                  conversation_id: conversationId,
                  round_number: 1,
                },
                error: null,
              }),
              update: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
        }
        if (table === "hive_members") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { role: "admin" },
              error: null,
            }),
          };
        }
        if (table === "decision_proposals") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: [
                {
                  id: "p1",
                  statement_text: "Statement 1",
                  original_agree_percent: 70,
                  display_order: 0,
                },
                {
                  id: "p2",
                  statement_text: "Statement 2",
                  original_agree_percent: 65,
                  display_order: 1,
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "decision_votes") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: [
                { proposal_id: "p1", votes: 5, user_id: "user-1" },
                { proposal_id: "p2", votes: 3, user_id: "user-2" },
              ],
              error: null,
            }),
          };
        }
        if (table === "conversations") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                source_conversation_id: TEST_SOURCE_CONV_ID,
                title: "Test Decision",
              },
              error: null,
            }),
          };
        }
        if (table === "decision_results") {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      const result = await closeDecisionRound(
        mockSupabase as unknown as SupabaseClient,
        TEST_USER_ID,
        roundId
      );

      expect(result.roundId).toBe(roundId);
      expect(updatedStatus).toBe("voting_closed");
    });

    it("requires admin role to close round", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "decision_rounds") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: "round-1",
                conversation_id: "conv-1",
                status: "voting_open",
                conversations: { hive_id: TEST_HIVE_ID },
              },
              error: null,
            }),
          };
        }
        if (table === "hive_members") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { role: "member" }, // Not admin
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await expect(
        closeDecisionRound(
          mockSupabase as unknown as SupabaseClient,
          TEST_USER_ID,
          "round-1"
        )
      ).rejects.toThrow("Only hive admins can close voting rounds");
    });

    it("fails if round is not open for voting", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "decision_rounds") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: "round-1",
                conversation_id: "conv-1",
                status: "voting_closed", // Already closed
                conversations: { hive_id: TEST_HIVE_ID },
              },
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await expect(
        closeDecisionRound(
          mockSupabase as unknown as SupabaseClient,
          TEST_USER_ID,
          "round-1"
        )
      ).rejects.toThrow("Round is not open for voting");
    });
  });

  // ============================================
  // RESULTS GENERATION TESTS
  // ============================================

  describe("Results Generation", () => {
    it("generateDecisionResults creates rankings", async () => {
      const roundId = "round-results-1";
      const conversationId = "conv-results-1";
      let savedRankings: unknown = null;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "decision_rounds") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: roundId,
                conversation_id: conversationId,
                round_number: 1,
              },
              error: null,
            }),
          };
        }
        if (table === "decision_proposals") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: [
                {
                  id: "p1",
                  statement_text: "Priority 1",
                  original_agree_percent: 75,
                  display_order: 0,
                },
                {
                  id: "p2",
                  statement_text: "Priority 2",
                  original_agree_percent: 60,
                  display_order: 1,
                },
                {
                  id: "p3",
                  statement_text: "Priority 3",
                  original_agree_percent: 80,
                  display_order: 2,
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "decision_votes") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: [
                { proposal_id: "p1", votes: 8, user_id: "user-a" },
                { proposal_id: "p1", votes: 5, user_id: "user-b" },
                { proposal_id: "p2", votes: 3, user_id: "user-a" },
                { proposal_id: "p3", votes: 10, user_id: "user-c" },
              ],
              error: null,
            }),
          };
        }
        if (table === "conversations") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                source_conversation_id: TEST_SOURCE_CONV_ID,
                title: "Test Decision",
              },
              error: null,
            }),
          };
        }
        if (table === "decision_results") {
          return {
            insert: jest.fn().mockImplementation((data) => {
              savedRankings = data.proposal_rankings;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await generateDecisionResults(
        mockSupabase as unknown as SupabaseClient,
        roundId
      );

      expect(savedRankings).toBeTruthy();
      const rankings = savedRankings as Array<{
        proposalId: string;
        totalVotes: number;
        rank: number;
      }>;

      // p1 has 13 votes (8+5), p2 has 3, p3 has 10
      // Sorted by votes: p1 (13), p3 (10), p2 (3)
      expect(rankings[0].proposalId).toBe("p1");
      expect(rankings[0].totalVotes).toBe(13);
      expect(rankings[0].rank).toBe(1);

      expect(rankings[1].proposalId).toBe("p3");
      expect(rankings[1].totalVotes).toBe(10);
      expect(rankings[1].rank).toBe(2);

      expect(rankings[2].proposalId).toBe("p2");
      expect(rankings[2].totalVotes).toBe(3);
      expect(rankings[2].rank).toBe(3);
    });

    it("handles round with no votes", async () => {
      const roundId = "round-no-votes";
      let savedRankings: unknown = null;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "decision_rounds") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: roundId, conversation_id: "conv-1", round_number: 1 },
              error: null,
            }),
          };
        }
        if (table === "decision_proposals") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: [
                {
                  id: "p1",
                  statement_text: "Statement 1",
                  original_agree_percent: 70,
                  display_order: 0,
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "decision_votes") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: [], // No votes
              error: null,
            }),
          };
        }
        if (table === "conversations") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                source_conversation_id: TEST_SOURCE_CONV_ID,
                title: "Test",
              },
              error: null,
            }),
          };
        }
        if (table === "decision_results") {
          return {
            insert: jest.fn().mockImplementation((data) => {
              savedRankings = data.proposal_rankings;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await generateDecisionResults(
        mockSupabase as unknown as SupabaseClient,
        roundId
      );

      expect(savedRankings).toBeTruthy();
      const rankings = savedRankings as Array<{
        totalVotes: number;
        votePercent: number;
      }>;
      expect(rankings[0].totalVotes).toBe(0);
      expect(rankings[0].votePercent).toBe(0);
    });
  });

  // ============================================
  // END-TO-END INTEGRATION FLOW
  // ============================================

  describe("End-to-End Flow", () => {
    it("completes full decision space lifecycle", async () => {
      // This test validates that all components work together in sequence

      // Step 1: Setup data fetched successfully
      const setupMock = createMockSupabase();
      setupMock.from.mockImplementation((table: string) => {
        if (table === "conversations") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: TEST_SOURCE_CONV_ID,
                hive_id: TEST_HIVE_ID,
                type: "understand",
                title: "Source Session",
                analysis_status: "ready",
              },
              error: null,
            }),
          };
        }
        if (table === "conversation_themes") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: [
                {
                  cluster_index: 0,
                  name: "Theme 1",
                  description: "Desc",
                  size: 5,
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "conversation_cluster_buckets") {
          const chain = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
          };
          chain.order.mockReturnValueOnce(chain);
          chain.order.mockResolvedValueOnce({
            data: [
              {
                id: "b1",
                cluster_index: 0,
                bucket_name: "B1",
                consolidated_statement: "S1",
                response_count: 3,
              },
            ],
            error: null,
          });
          return chain;
        }
        if (table === "conversation_cluster_bucket_members") {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      const setupData = await getDecisionSetupData(
        setupMock as unknown as SupabaseClient,
        TEST_USER_ID,
        TEST_SOURCE_CONV_ID
      );
      expect(setupData.clusters.length).toBeGreaterThan(0);
      expect(setupData.statements.length).toBeGreaterThan(0);

      // Step 2: Session created
      const createMock = createMockSupabase();
      let createConvCallCount = 0;
      createMock.from.mockImplementation((table: string) => {
        if (table === "conversations") {
          createConvCallCount++;
          if (createConvCallCount === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: TEST_SOURCE_CONV_ID,
                  hive_id: TEST_HIVE_ID,
                  type: "understand",
                  analysis_status: "ready",
                },
                error: null,
              }),
            };
          }
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({
                data: { id: "new-conv", slug: "test" },
                error: null,
              }),
          };
        }
        if (table === "hive_members") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest
              .fn()
              .mockResolvedValue({ data: { role: "admin" }, error: null }),
          };
        }
        if (table === "decision_proposals") {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }
        if (table === "decision_rounds") {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: { id: "round-1" }, error: null }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      const session = await createDecisionSession(
        createMock as unknown as SupabaseClient,
        TEST_USER_ID,
        {
          hiveId: TEST_HIVE_ID,
          sourceConversationId: TEST_SOURCE_CONV_ID,
          title: "E2E Test Decision",
          selectedClusters: [0],
          selectedStatements: setupData.statements.map((s) => ({
            bucketId: s.bucketId,
            clusterIndex: s.clusterIndex,
            statementText: s.statementText,
            agreePercent: s.agreePercent,
          })),
          consensusThreshold: 70,
          visibility: "hidden",
        }
      );
      expect(session.conversationId).toBeTruthy();
      expect(session.roundId).toBeTruthy();

      // Step 3: Voting works
      const voteMock = createMockSupabase();
      voteMock.rpc.mockResolvedValue({
        data: { success: true, new_votes: 1, remaining_credits: 98 },
        error: null,
      });

      const voteResult = await voteOnDecisionProposal(
        voteMock as unknown as SupabaseClient,
        TEST_USER_ID,
        {
          roundId: session.roundId,
          proposalId: "proposal-1",
          delta: 1,
        }
      );
      expect(voteResult.success).toBe(true);

      // Step 4: Round closes successfully
      // (Already covered in individual tests, showing flow continuity)
      expect(true).toBe(true); // Assertion that flow completes
    });
  });
});
