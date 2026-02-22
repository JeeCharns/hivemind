/**
 * Unit tests for maybeEnqueueAutoAnalysis
 *
 * Tests auto-triggering logic and idempotency
 */

import { maybeEnqueueAutoAnalysis } from "../maybeEnqueueAutoAnalysis";
import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("../enqueueConversationAnalysis", () => ({
  enqueueConversationAnalysis: jest.fn(),
}));

import { enqueueConversationAnalysis } from "../enqueueConversationAnalysis";

describe("maybeEnqueueAutoAnalysis", () => {
  let mockSupabase: SupabaseClient;
  let mockConversationsMaybeSingle: jest.Mock<Promise<unknown>, []>;
  let mockResponsesSelect: jest.Mock<unknown, unknown[]>;
  let mockResponsesEq: jest.Mock<Promise<unknown>, [string, string]>;

  beforeEach(() => {
    jest.resetAllMocks();

    mockConversationsMaybeSingle = jest.fn<Promise<unknown>, []>();

    mockResponsesEq = jest.fn<Promise<unknown>, [string, string]>();
    mockResponsesSelect = jest.fn().mockReturnValue({ eq: mockResponsesEq });

    mockSupabase = {
      from: ((table: string) => {
        if (table === "conversations") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: mockConversationsMaybeSingle,
              }),
            }),
          };
        }

        if (table === "conversation_responses") {
          return {
            select: mockResponsesSelect,
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }) as unknown as SupabaseClient["from"],
    } as unknown as SupabaseClient;
  });

  it("should skip if conversation type is not 'understand'", async () => {
    // Arrange
    mockConversationsMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "conv-1",
        type: "decide",
        analysis_status: null,
        analysis_response_count: null,
      },
      error: null,
    });

    // Act
    const result = await maybeEnqueueAutoAnalysis(
      mockSupabase,
      "conv-1",
      "user-1"
    );

    // Assert
    expect(result.triggered).toBe(false);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("wrong_conversation_type");
  });

  it("should skip if response count is below threshold", async () => {
    // Arrange
    mockConversationsMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "conv-1",
        type: "understand",
        analysis_status: null,
        analysis_response_count: null,
      },
      error: null,
    });

    // Mock count query
    mockResponsesEq.mockResolvedValueOnce({
      count: 15,
      error: null,
    });

    // Act
    const result = await maybeEnqueueAutoAnalysis(
      mockSupabase,
      "conv-1",
      "user-1",
      { threshold: 20 }
    );

    // Assert
    expect(result.triggered).toBe(false);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("below_threshold");
  });

  it("should skip if analysis is already fresh", async () => {
    // Arrange
    mockConversationsMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "conv-1",
        type: "understand",
        analysis_status: "ready",
        analysis_response_count: 25,
      },
      error: null,
    });

    // Mock count query
    mockResponsesEq.mockResolvedValueOnce({
      count: 25,
      error: null,
    });

    // Act
    const result = await maybeEnqueueAutoAnalysis(
      mockSupabase,
      "conv-1",
      "user-1"
    );

    // Assert
    expect(result.triggered).toBe(false);
    expect(result.status).toBe("already_complete");
    expect(result.reason).toBe("analysis_already_fresh");
  });

  it("should trigger analysis when threshold is met", async () => {
    // Arrange
    mockConversationsMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "conv-1",
        type: "understand",
        analysis_status: null,
        analysis_response_count: null,
      },
      error: null,
    });

    // Mock count query
    mockResponsesEq.mockResolvedValueOnce({
      count: 20,
      error: null,
    });

    const mockEnqueueConversationAnalysis =
      enqueueConversationAnalysis as jest.MockedFunction<
        typeof enqueueConversationAnalysis
      >;
    mockEnqueueConversationAnalysis.mockResolvedValueOnce({ status: "queued" });

    // Act
    const result = await maybeEnqueueAutoAnalysis(
      mockSupabase,
      "conv-1",
      "user-1",
      { threshold: 20 }
    );

    // Assert
    expect(result.triggered).toBe(true);
    expect(result.status).toBe("queued");
    expect(mockEnqueueConversationAnalysis).toHaveBeenCalledWith(
      mockSupabase,
      "conv-1",
      "user-1"
    );
  });
});
