/**
 * Tests for Save Consolidated Statements
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { saveConsolidatedStatements } from "../saveConsolidatedStatements";
import type { ConsolidationOutput } from "../../domain/statementConsolidation";

// Mock Supabase client
function createMockSupabase(options?: {
  deleteError?: Error;
  insertError?: Error;
}): SupabaseClient {
  const mockDelete = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({
      error: options?.deleteError || null,
    }),
  });

  const mockInsert = jest.fn().mockResolvedValue({
    error: options?.insertError || null,
  });

  return {
    from: jest.fn().mockReturnValue({
      delete: mockDelete,
      insert: mockInsert,
    }),
  } as unknown as SupabaseClient;
}

describe("saveConsolidatedStatements", () => {
  const conversationId = "conv-123";

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("deletes existing statements before inserting new ones", async () => {
    const mockSupabase = createMockSupabase();
    const statements: ConsolidationOutput[] = [
      {
        groupId: "g1",
        synthesizedStatement: "Combined statement",
        combinedResponseIds: ["1", "2"],
        combinedResponses: "1: First | 2: Second",
      },
    ];

    await saveConsolidatedStatements(mockSupabase, conversationId, statements);

    // Verify delete was called first
    expect(mockSupabase.from).toHaveBeenCalledWith(
      "conversation_consolidated_statements"
    );
    const deleteCall = (mockSupabase.from as jest.Mock).mock.results[0].value;
    expect(deleteCall.delete).toHaveBeenCalled();
  });

  it("returns early when no statements to save", async () => {
    const mockSupabase = createMockSupabase();

    await saveConsolidatedStatements(mockSupabase, conversationId, []);

    // Delete should still be called (to clean up old statements)
    expect(mockSupabase.from).toHaveBeenCalledWith(
      "conversation_consolidated_statements"
    );

    // But only once (for delete, not for insert)
    const fromCalls = (mockSupabase.from as jest.Mock).mock.calls;
    expect(fromCalls.length).toBe(1);
  });

  it("inserts statements with correct fields", async () => {
    const mockFrom = jest.fn();
    const mockDelete = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    const mockInsert = jest.fn().mockResolvedValue({ error: null });

    mockFrom.mockReturnValue({
      delete: mockDelete,
      insert: mockInsert,
    });

    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

    const statements: ConsolidationOutput[] = [
      {
        groupId: "group-uuid-123",
        synthesizedStatement: "The synthesized statement",
        combinedResponseIds: ["100", "101", "102"],
        combinedResponses: "100: First | 101: Second | 102: Third",
      },
    ];

    await saveConsolidatedStatements(mockSupabase, conversationId, statements);

    // Verify insert was called with correct data
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        conversation_id: conversationId,
        group_id: "group-uuid-123",
        synthesized_statement: "The synthesized statement",
        combined_response_ids: [100, 101, 102], // Should be converted to numbers
        combined_responses: "100: First | 101: Second | 102: Third",
        model_used: "gpt-4o-mini",
        prompt_version: "v1.0",
      }),
    ]);
  });

  it("throws error when delete fails", async () => {
    const mockSupabase = createMockSupabase({
      deleteError: new Error("Delete failed"),
    });

    const statements: ConsolidationOutput[] = [
      {
        groupId: "g1",
        synthesizedStatement: "Test",
        combinedResponseIds: ["1"],
        combinedResponses: "1: Test",
      },
    ];

    await expect(
      saveConsolidatedStatements(mockSupabase, conversationId, statements)
    ).rejects.toThrow("Failed to delete old statements");
  });

  it("throws error when insert fails", async () => {
    const mockFrom = jest.fn();
    const mockDelete = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    const mockInsert = jest
      .fn()
      .mockResolvedValue({ error: new Error("Insert failed") });

    mockFrom.mockReturnValue({
      delete: mockDelete,
      insert: mockInsert,
    });

    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

    const statements: ConsolidationOutput[] = [
      {
        groupId: "g1",
        synthesizedStatement: "Test",
        combinedResponseIds: ["1"],
        combinedResponses: "1: Test",
      },
    ];

    await expect(
      saveConsolidatedStatements(mockSupabase, conversationId, statements)
    ).rejects.toThrow("Failed to save statements");
  });

  it("handles multiple statements", async () => {
    const mockFrom = jest.fn();
    const mockDelete = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    const mockInsert = jest.fn().mockResolvedValue({ error: null });

    mockFrom.mockReturnValue({
      delete: mockDelete,
      insert: mockInsert,
    });

    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

    const statements: ConsolidationOutput[] = [
      {
        groupId: "g1",
        synthesizedStatement: "Statement 1",
        combinedResponseIds: ["1", "2"],
        combinedResponses: "1: A | 2: B",
      },
      {
        groupId: "g2",
        synthesizedStatement: "Statement 2",
        combinedResponseIds: ["3", "4", "5"],
        combinedResponses: "3: C | 4: D | 5: E",
      },
    ];

    await saveConsolidatedStatements(mockSupabase, conversationId, statements);

    // Verify insert was called with both statements
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ group_id: "g1" }),
      expect.objectContaining({ group_id: "g2" }),
    ]);
  });

  it("logs statistics after successful save", async () => {
    const consoleSpy = jest.spyOn(console, "log");
    const mockFrom = jest.fn();
    const mockDelete = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    const mockInsert = jest.fn().mockResolvedValue({ error: null });

    mockFrom.mockReturnValue({
      delete: mockDelete,
      insert: mockInsert,
    });

    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

    const statements: ConsolidationOutput[] = [
      {
        groupId: "g1",
        synthesizedStatement: "Statement",
        combinedResponseIds: ["1", "2", "3"],
        combinedResponses: "...",
      },
    ];

    await saveConsolidatedStatements(mockSupabase, conversationId, statements);

    // Verify stats were logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[saveConsolidatedStatements] Stats:"),
      expect.objectContaining({
        statementCount: 1,
        totalResponsesConsolidated: 3,
      })
    );
  });
});
