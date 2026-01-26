// lib/decision-space/server/__tests__/createDecisionSession.test.ts

import { createDecisionSession } from "../createDecisionSession";

const mockSupabase = {
  from: jest.fn(),
};

describe("createDecisionSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates conversation, proposals, and first round", async () => {
    const insertedConversation = { id: "conv-new", slug: "decision-1" };
    const insertedRound = { id: "round-1" };

    // Track call order for conversation table
    let conversationCallCount = 0;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "conversations") {
        conversationCallCount++;
        if (conversationCallCount === 1) {
          // First call: check source conversation
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: "source-conv", hive_id: "hive-1", type: "understand", analysis_status: "ready" },
              error: null,
            }),
          };
        } else {
          // Second call: insert new conversation
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: insertedConversation,
              error: null,
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
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "decision_rounds") {
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: insertedRound,
            error: null,
          }),
        };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    const result = await createDecisionSession(mockSupabase as unknown, "user-1", {
      hiveId: "hive-1",
      sourceConversationId: "source-conv",
      title: "Test Decision",
      selectedClusters: [0],
      selectedStatements: [
        { bucketId: "bucket-1", clusterIndex: 0, statementText: "Statement 1", agreePercent: 80 },
      ],
      consensusThreshold: 70,
      visibility: "hidden",
    });

    expect(result.conversationId).toBe("conv-new");
    expect(result.roundId).toBe("round-1");
  });

  it("requires admin role to create decision session", async () => {
    let conversationCallCount = 0;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "conversations") {
        conversationCallCount++;
        if (conversationCallCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: "source-conv", hive_id: "hive-1", type: "understand", analysis_status: "ready" },
              error: null,
            }),
          };
        }
      }
      if (table === "hive_members") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { role: "member" },
            error: null,
          }),
        };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    await expect(
      createDecisionSession(mockSupabase as unknown, "user-1", {
        hiveId: "hive-1",
        sourceConversationId: "source-conv",
        title: "Test",
        selectedClusters: [0],
        selectedStatements: [
          { bucketId: "b1", clusterIndex: 0, statementText: "S1", agreePercent: 80 },
        ],
        consensusThreshold: 70,
        visibility: "hidden",
      })
    ).rejects.toThrow("Only hive admins can create decision sessions");
  });

  it("throws error if source conversation not found", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "conversations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    await expect(
      createDecisionSession(mockSupabase as unknown, "user-1", {
        hiveId: "hive-1",
        sourceConversationId: "invalid",
        title: "Test",
        selectedClusters: [0],
        selectedStatements: [
          { bucketId: "b1", clusterIndex: 0, statementText: "S1", agreePercent: 80 },
        ],
        consensusThreshold: 70,
        visibility: "hidden",
      })
    ).rejects.toThrow("Source conversation not found");
  });
});
