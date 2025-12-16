/**
 * Unit tests for importResponsesFromCsv service
 *
 * Tests CSV parsing, validation, tag normalization, and error handling
 */

import { importResponsesFromCsv } from "../importResponsesFromCsv";

// Mock Supabase client
const createMockSupabase = (): any => {
  const mockSupabase: any = {
    from: jest.fn(() => mockSupabase),
    select: jest.fn(() => mockSupabase),
    insert: jest.fn(() => mockSupabase),
    update: jest.fn(() => mockSupabase),
    eq: jest.fn(() => mockSupabase),
    single: jest.fn(() => mockSupabase),
  };
  return mockSupabase;
};

// Helper to create a File object from CSV string
const createCsvFile = (content: string, filename = "test.csv"): File => {
  const blob = new Blob([content], { type: "text/csv" });
  return new File([blob], filename, { type: "text/csv" });
};

describe("importResponsesFromCsv", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  const conversationId = "conv-123";
  const userId = "user-456";

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    jest.clearAllMocks();
  });

  it("should import valid CSV with responses", async () => {
    // Mock conversation fetch
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: conversationId, hive_id: "hive-1", type: "understand" },
      error: null,
    });

    // Mock successful insert
    mockSupabase.insert.mockResolvedValueOnce({ error: null });

    const csvContent = `response,tag
"First response","need"
"Second response","data"`;

    const file = createCsvFile(csvContent);

    const result = await importResponsesFromCsv(
      mockSupabase as any,
      conversationId,
      userId,
      file
    );

    expect(result.importedCount).toBe(2);
    expect(result.importBatchId).toBeDefined();

    // Verify insert was called with correct data
    expect(mockSupabase.insert).toHaveBeenCalled();
  });

  it("should normalize unknown tags to 'proposal'", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: conversationId, hive_id: "hive-1", type: "understand" },
      error: null,
    });

    mockSupabase.insert.mockImplementationOnce((rows: any[]) => {
      // Verify tag normalization
      expect(rows[0].tag).toBe("proposal");
      expect(rows[1].tag).toBe("need");
      return { error: null };
    });

    const csvContent = `response,tag
"Response with unknown tag","unknown_tag"
"Response with known tag","need"`;

    const file = createCsvFile(csvContent);

    await importResponsesFromCsv(
      mockSupabase as any,
      conversationId,
      userId,
      file
    );
  });

  it("should reject CSV without 'response' column", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: conversationId, hive_id: "hive-1", type: "understand" },
      error: null,
    });

    const csvContent = `text,tag
"First response","need"`;

    const file = createCsvFile(csvContent);

    await expect(
      importResponsesFromCsv(mockSupabase as any, conversationId, userId, file)
    ).rejects.toThrow('CSV must include a column named "response"');
  });

  it("should reject CSV exceeding row limit", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: conversationId, hive_id: "hive-1", type: "understand" },
      error: null,
    });

    // Create CSV with 1001 rows
    const rows = Array.from(
      { length: 1001 },
      (_, i) => `"Response ${i}","need"`
    );
    const csvContent = `response,tag\n${rows.join("\n")}`;

    const file = createCsvFile(csvContent);

    await expect(
      importResponsesFromCsv(mockSupabase as any, conversationId, userId, file)
    ).rejects.toThrow("CSV exceeds maximum of 1000 rows");
  });

  it("should reject empty CSV", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: conversationId, hive_id: "hive-1", type: "understand" },
      error: null,
    });

    const csvContent = `response,tag`;

    const file = createCsvFile(csvContent);

    await expect(
      importResponsesFromCsv(mockSupabase as any, conversationId, userId, file)
    ).rejects.toThrow("CSV file is empty");
  });

  it("should reject CSV for 'decide' conversation type", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: conversationId, hive_id: "hive-1", type: "decide" },
      error: null,
    });

    const csvContent = `response,tag
"First response","need"`;

    const file = createCsvFile(csvContent);

    await expect(
      importResponsesFromCsv(mockSupabase as any, conversationId, userId, file)
    ).rejects.toThrow("CSV import is only supported for 'understand' sessions");
  });

  it("should skip empty response rows", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: conversationId, hive_id: "hive-1", type: "understand" },
      error: null,
    });

    mockSupabase.insert.mockImplementationOnce((rows: any[]) => {
      // Verify only non-empty responses are included
      expect(rows.length).toBe(2);
      return { error: null };
    });

    const csvContent = `response,tag
"First response","need"
"","data"
"Third response","want"`;

    const file = createCsvFile(csvContent);

    const result = await importResponsesFromCsv(
      mockSupabase as any,
      conversationId,
      userId,
      file
    );

    expect(result.importedCount).toBe(2);
  });

  it("should handle conversation not found", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: null,
      error: { message: "Not found" },
    });

    const csvContent = `response,tag
"First response","need"`;

    const file = createCsvFile(csvContent);

    await expect(
      importResponsesFromCsv(mockSupabase as any, conversationId, userId, file)
    ).rejects.toThrow("Conversation not found");
  });

  it("should reject files exceeding size limit", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: conversationId, hive_id: "hive-1", type: "understand" },
      error: null,
    });

    // Create a large file (>10MB)
    const largeContent = "a".repeat(11 * 1024 * 1024);
    const file = createCsvFile(largeContent);

    await expect(
      importResponsesFromCsv(mockSupabase as any, conversationId, userId, file)
    ).rejects.toThrow("File size exceeds maximum");
  });

  describe("anonymity handling", () => {
    it("should default imported responses to is_anonymous = true", async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: conversationId, hive_id: "hive-1", type: "understand" },
        error: null,
      });

      mockSupabase.insert.mockImplementationOnce((rows: any[]) => {
        // Verify all rows default to is_anonymous = true
        expect(rows.length).toBe(2);
        expect(rows[0].is_anonymous).toBe(true);
        expect(rows[1].is_anonymous).toBe(true);
        return { error: null };
      });

      const csvContent = `response,tag
"First response","need"
"Second response","data"`;

      const file = createCsvFile(csvContent);

      await importResponsesFromCsv(
        mockSupabase as any,
        conversationId,
        userId,
        file
      );
    });

    it("should respect explicit 'anonymous' column set to false", async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: conversationId, hive_id: "hive-1", type: "understand" },
        error: null,
      });

      mockSupabase.insert.mockImplementationOnce((rows: any[]) => {
        expect(rows.length).toBe(2);
        expect(rows[0].is_anonymous).toBe(false);
        expect(rows[1].is_anonymous).toBe(true);
        return { error: null };
      });

      const csvContent = `response,tag,anonymous
"First response","need","false"
"Second response","data","true"`;

      const file = createCsvFile(csvContent);

      await importResponsesFromCsv(
        mockSupabase as any,
        conversationId,
        userId,
        file
      );
    });

    it("should parse various boolean formats for anonymous column", async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: conversationId, hive_id: "hive-1", type: "understand" },
        error: null,
      });

      mockSupabase.insert.mockImplementationOnce((rows: any[]) => {
        expect(rows.length).toBe(6);
        expect(rows[0].is_anonymous).toBe(false); // "false"
        expect(rows[1].is_anonymous).toBe(false); // "0"
        expect(rows[2].is_anonymous).toBe(false); // "no"
        expect(rows[3].is_anonymous).toBe(true);  // "true"
        expect(rows[4].is_anonymous).toBe(true);  // "1"
        expect(rows[5].is_anonymous).toBe(true);  // "yes"
        return { error: null };
      });

      const csvContent = `response,tag,anonymous
"Response 1","need","false"
"Response 2","data","0"
"Response 3","want","no"
"Response 4","need","true"
"Response 5","data","1"
"Response 6","want","yes"`;

      const file = createCsvFile(csvContent);

      await importResponsesFromCsv(
        mockSupabase as any,
        conversationId,
        userId,
        file
      );
    });

    it("should support 'is_anonymous' column name", async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: conversationId, hive_id: "hive-1", type: "understand" },
        error: null,
      });

      mockSupabase.insert.mockImplementationOnce((rows: any[]) => {
        expect(rows.length).toBe(2);
        expect(rows[0].is_anonymous).toBe(false);
        expect(rows[1].is_anonymous).toBe(true);
        return { error: null };
      });

      const csvContent = `response,tag,is_anonymous
"First response","need","false"
"Second response","data","true"`;

      const file = createCsvFile(csvContent);

      await importResponsesFromCsv(
        mockSupabase as any,
        conversationId,
        userId,
        file
      );
    });
  });
});
