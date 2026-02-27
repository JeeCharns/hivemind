// lib/deliberate-space/server/__tests__/createDeliberateSession.test.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { createDeliberateSession } from "../createDeliberateSession";

const mockSupabase = {
  from: jest.fn(),
};

describe("createDeliberateSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("from-scratch mode", () => {
    it("creates session with manual statements", async () => {
      const insertedConversation = { id: "conv-123", slug: "test-deliberation" };

      mockSupabase.from.mockImplementation((table: string) => {
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
        if (table === "conversations") {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: insertedConversation,
              error: null,
            }),
          };
        }
        if (table === "deliberation_statements") {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      const result = await createDeliberateSession(
        mockSupabase as unknown as SupabaseClient,
        "user-123",
        {
          hiveId: "hive-123",
          mode: "from-scratch",
          title: "Test Deliberation",
          manualStatements: [
            { text: "Statement 1" },
            { text: "Statement 2", clusterName: "Group A" },
          ],
        }
      );

      expect(result.conversationId).toBe("conv-123");
      expect(result.slug).toBe("test-deliberation");
    });

    it("creates statements with correct display_order", async () => {
      const insertedConversation = { id: "conv-456", slug: "ordered-test" };
      let capturedStatements: unknown[] = [];

      mockSupabase.from.mockImplementation((table: string) => {
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
        if (table === "conversations") {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: insertedConversation,
              error: null,
            }),
          };
        }
        if (table === "deliberation_statements") {
          return {
            insert: jest.fn((data: unknown[]) => {
              capturedStatements = data;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await createDeliberateSession(
        mockSupabase as unknown as SupabaseClient,
        "user-123",
        {
          hiveId: "hive-123",
          mode: "from-scratch",
          title: "Test",
          manualStatements: [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ],
        }
      );

      expect(capturedStatements).toHaveLength(3);
      expect(capturedStatements[0]).toMatchObject({
        statement_text: "First",
        display_order: 0,
        cluster_index: null,
      });
      expect(capturedStatements[1]).toMatchObject({
        statement_text: "Second",
        display_order: 1,
      });
      expect(capturedStatements[2]).toMatchObject({
        statement_text: "Third",
        display_order: 2,
      });
    });
  });

  describe("from-understand mode", () => {
    it("creates session from source conversation", async () => {
      const insertedConversation = {
        id: "conv-new",
        slug: "deliberation-from-source",
      };
      let conversationCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
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
        if (table === "conversations") {
          conversationCallCount++;
          if (conversationCallCount === 1) {
            // First call: check source conversation
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: "source-conv",
                  hive_id: "hive-1",
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
                data: insertedConversation,
                error: null,
              }),
            };
          }
        }
        if (table === "deliberation_statements") {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      const result = await createDeliberateSession(
        mockSupabase as unknown as SupabaseClient,
        "user-1",
        {
          hiveId: "hive-1",
          mode: "from-understand",
          title: "Deliberation from Understanding",
          sourceConversationId: "source-conv",
          selectedStatements: [
            {
              bucketId: "bucket-1",
              clusterIndex: 0,
              clusterName: "Theme A",
              statementText: "Important statement",
            },
            {
              bucketId: "bucket-2",
              clusterIndex: 1,
              clusterName: "Theme B",
              statementText: "Another statement",
            },
          ],
        }
      );

      expect(result.conversationId).toBe("conv-new");
      expect(result.slug).toBe("deliberation-from-source");
    });

    it("includes source_bucket_id for imported statements", async () => {
      const insertedConversation = { id: "conv-789", slug: "imported-test" };
      let capturedStatements: unknown[] = [];
      let conversationCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
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
        if (table === "conversations") {
          conversationCallCount++;
          if (conversationCallCount === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: "source-conv",
                  hive_id: "hive-1",
                  type: "explore",
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
              data: insertedConversation,
              error: null,
            }),
          };
        }
        if (table === "deliberation_statements") {
          return {
            insert: jest.fn((data: unknown[]) => {
              capturedStatements = data;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await createDeliberateSession(
        mockSupabase as unknown as SupabaseClient,
        "user-1",
        {
          hiveId: "hive-1",
          mode: "from-understand",
          title: "Test",
          sourceConversationId: "source-conv",
          selectedStatements: [
            {
              bucketId: "bucket-uuid-1",
              clusterIndex: 2,
              clusterName: "Theme C",
              statementText: "Imported statement",
            },
          ],
        }
      );

      expect(capturedStatements).toHaveLength(1);
      expect(capturedStatements[0]).toMatchObject({
        source_bucket_id: "bucket-uuid-1",
        cluster_index: 2,
        cluster_name: "Theme C",
        statement_text: "Imported statement",
      });
    });
  });

  describe("error cases", () => {
    it("throws error if user is not a hive member", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "hive_members") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await expect(
        createDeliberateSession(
          mockSupabase as unknown as SupabaseClient,
          "user-123",
          {
            hiveId: "hive-123",
            mode: "from-scratch",
            title: "Test",
            manualStatements: [{ text: "Statement" }],
          }
        )
      ).rejects.toThrow("User is not a member of this hive");
    });

    it("throws error if source conversation not found", async () => {
      let conversationCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
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
        if (table === "conversations") {
          conversationCallCount++;
          if (conversationCallCount === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            };
          }
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await expect(
        createDeliberateSession(
          mockSupabase as unknown as SupabaseClient,
          "user-1",
          {
            hiveId: "hive-1",
            mode: "from-understand",
            title: "Test",
            sourceConversationId: "invalid-conv",
            selectedStatements: [
              {
                bucketId: "b1",
                clusterIndex: 0,
                clusterName: "Theme",
                statementText: "S1",
              },
            ],
          }
        )
      ).rejects.toThrow("Source conversation not found");
    });

    it("throws error if source conversation is in different hive", async () => {
      let conversationCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
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
        if (table === "conversations") {
          conversationCallCount++;
          if (conversationCallCount === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: "source-conv",
                  hive_id: "different-hive",
                  type: "understand",
                  analysis_status: "ready",
                },
                error: null,
              }),
            };
          }
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await expect(
        createDeliberateSession(
          mockSupabase as unknown as SupabaseClient,
          "user-1",
          {
            hiveId: "hive-1",
            mode: "from-understand",
            title: "Test",
            sourceConversationId: "source-conv",
            selectedStatements: [
              {
                bucketId: "b1",
                clusterIndex: 0,
                clusterName: "Theme",
                statementText: "S1",
              },
            ],
          }
        )
      ).rejects.toThrow("Source conversation must be in the same hive");
    });

    it("throws error if source is not understand or explore type", async () => {
      let conversationCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
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
        if (table === "conversations") {
          conversationCallCount++;
          if (conversationCallCount === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: "source-conv",
                  hive_id: "hive-1",
                  type: "decide",
                  analysis_status: "ready",
                },
                error: null,
              }),
            };
          }
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await expect(
        createDeliberateSession(
          mockSupabase as unknown as SupabaseClient,
          "user-1",
          {
            hiveId: "hive-1",
            mode: "from-understand",
            title: "Test",
            sourceConversationId: "source-conv",
            selectedStatements: [
              {
                bucketId: "b1",
                clusterIndex: 0,
                clusterName: "Theme",
                statementText: "S1",
              },
            ],
          }
        )
      ).rejects.toThrow("Source must be an understand or explore session");
    });

    it("throws error if source analysis is not ready", async () => {
      let conversationCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
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
        if (table === "conversations") {
          conversationCallCount++;
          if (conversationCallCount === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: "source-conv",
                  hive_id: "hive-1",
                  type: "understand",
                  analysis_status: "analyzing",
                },
                error: null,
              }),
            };
          }
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await expect(
        createDeliberateSession(
          mockSupabase as unknown as SupabaseClient,
          "user-1",
          {
            hiveId: "hive-1",
            mode: "from-understand",
            title: "Test",
            sourceConversationId: "source-conv",
            selectedStatements: [
              {
                bucketId: "b1",
                clusterIndex: 0,
                clusterName: "Theme",
                statementText: "S1",
              },
            ],
          }
        )
      ).rejects.toThrow("Source analysis must be complete");
    });

    it("rolls back conversation if statement insert fails", async () => {
      const insertedConversation = { id: "conv-to-delete", slug: "test" };
      let deleteCalled = false;

      mockSupabase.from.mockImplementation((table: string) => {
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
        if (table === "conversations") {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: insertedConversation,
              error: null,
            }),
            delete: jest.fn(() => {
              deleteCalled = true;
              return {
                eq: jest.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        if (table === "deliberation_statements") {
          return {
            insert: jest.fn().mockResolvedValue({
              error: { message: "Insert failed" },
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      await expect(
        createDeliberateSession(
          mockSupabase as unknown as SupabaseClient,
          "user-123",
          {
            hiveId: "hive-123",
            mode: "from-scratch",
            title: "Test",
            manualStatements: [{ text: "Statement" }],
          }
        )
      ).rejects.toThrow("Failed to create statements");

      expect(deleteCalled).toBe(true);
    });
  });
});
