// lib/decision-space/server/__tests__/getDecisionSetupData.test.ts

import { getDecisionSetupData } from "../getDecisionSetupData";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
};

// Mock requireHiveMember
jest.mock("@/lib/conversations/server/requireHiveMember", () => ({
  requireHiveMember: jest.fn().mockResolvedValue(undefined),
}));

describe("getDecisionSetupData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns clusters and statements from completed understand session", async () => {
    // Setup mock chain for conversation check
    const mockConversationChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: "conv-123",
          hive_id: "hive-456",
          type: "understand",
          title: "Test Session",
          analysis_status: "ready",
        },
        error: null,
      }),
    };

    // Setup mock chain for themes
    const mockThemesChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          { cluster_index: 0, name: "Climate", description: "Climate topics", size: 10 },
          { cluster_index: 1, name: "Economy", description: "Economic topics", size: 8 },
        ],
        error: null,
      }),
    };

    // Setup mock chain for buckets
    const mockBucketsChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
    };
    mockBucketsChain.order.mockReturnValueOnce(mockBucketsChain);
    mockBucketsChain.order.mockResolvedValueOnce({
      data: [
        {
          id: "bucket-1",
          cluster_index: 0,
          bucket_name: "Renewable Energy",
          consolidated_statement: "We should invest in renewable energy",
          response_count: 5,
        },
      ],
      error: null,
    });

    // Setup mock chain for bucket members (empty for simplicity)
    const mockMembersChain = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "conversations") return mockConversationChain;
      if (table === "conversation_themes") return mockThemesChain;
      if (table === "conversation_cluster_buckets") return mockBucketsChain;
      if (table === "conversation_cluster_bucket_members") return mockMembersChain;
      return { select: jest.fn().mockReturnThis() };
    });

    const result = await getDecisionSetupData(
      mockSupabase as unknown as SupabaseClient,
      "user-789",
      "conv-123"
    );

    expect(result.sourceConversationId).toBe("conv-123");
    expect(result.sourceTitle).toBe("Test Session");
    expect(result.clusters).toHaveLength(2);
    expect(result.clusters[0].name).toBe("Climate");
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0].statementText).toBe("We should invest in renewable energy");
  });

  it("throws error if conversation not found", async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });

    await expect(
      getDecisionSetupData(mockSupabase as unknown as SupabaseClient, "user-789", "invalid-id")
    ).rejects.toThrow("Source conversation not found");
  });

  it("throws error if conversation is not understand type", async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: "conv-123",
          hive_id: "hive-456",
          type: "decide",
          analysis_status: "ready",
        },
        error: null,
      }),
    });

    await expect(
      getDecisionSetupData(mockSupabase as unknown as SupabaseClient, "user-789", "conv-123")
    ).rejects.toThrow("Source must be an understand session");
  });

  it("throws error if analysis not complete", async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: "conv-123",
          hive_id: "hive-456",
          type: "understand",
          analysis_status: "embedding",
        },
        error: null,
      }),
    });

    await expect(
      getDecisionSetupData(mockSupabase as unknown as SupabaseClient, "user-789", "conv-123")
    ).rejects.toThrow("Analysis must be complete");
  });
});
