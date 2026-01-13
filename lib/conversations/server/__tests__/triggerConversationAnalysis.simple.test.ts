/**
 * Simplified Tests for triggerConversationAnalysis
 *
 * These tests demonstrate the correct mocking pattern.
 * Use these as a reference for refactoring the full test suite.
 */

import { triggerConversationAnalysis } from "../triggerConversationAnalysis";
import type { TriggerAnalysisRequest } from "../../schemas";
import {
  createMockSupabase,
  mockCountQuery,
  mockDataQuery,
  mockInsert,
  mockUpdate,
  mockNoExistingJobs,
  generateConversation,
  generateMembership,
  expectStrategyDecision,
} from "./testUtils";

describe("triggerConversationAnalysis (simplified examples)", () => {
  const userId = "user-123";
  const conversationId = "conv-123";
  const defaultRequest: TriggerAnalysisRequest = {
    mode: "manual",
    strategy: "auto",
  };

  describe("freshness detection", () => {
    it("returns already_complete when analysis is fresh", async () => {
      const supabase = createMockSupabase();

      // Step 1: Mock conversation fetch (will be called via .single())
      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 25,
        })
      );

      // Step 2: Mock membership check (will be called via .maybeSingle())
      mockDataQuery(supabase, generateMembership(userId), false);

      // Step 3: Mock response count query (special handling for count queries)
      mockCountQuery(supabase, 25);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result.status).toBe("already_complete");
      expect(result.reason).toBe("fresh");
      expect(result.currentResponseCount).toBe(25);
      expect(result.analysisResponseCount).toBe(25);
      expect(result.newResponsesSinceAnalysis).toBe(0);
    });

    it("proceeds to strategy decision when stale", async () => {
      const supabase = createMockSupabase();

      // Mock conversation (stale: 20 analyzed, 25 current)
      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

      // Mock membership
      mockDataQuery(supabase, generateMembership(userId), false);

      // Mock response count
      mockCountQuery(supabase, 25);

      // Mock existing jobs check (no active jobs)
      mockNoExistingJobs(supabase);

      // Mock cluster models check (prerequisite for incremental)
      mockCountQuery(supabase, 3);

      // Mock job insert success
      mockInsert(supabase);

      // Mock conversation update success
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result.status).toBe("queued");
      expect(result.strategy).toBe("incremental");
      expect(result.newResponsesSinceAnalysis).toBe(5);
    });
  });

  describe("strategy decision", () => {
    it("chooses incremental when newCount < 10 with prerequisites", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

      mockDataQuery(supabase, generateMembership(userId), false);

      // 25 current responses (5 new)
      mockCountQuery(supabase, 25);

      // Mock existing jobs check (no active jobs)
      mockNoExistingJobs(supabase);

      // 3 cluster models exist (prerequisites met)
      mockCountQuery(supabase, 3);

      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expectStrategyDecision(result, "incremental");
    });

    it("chooses full when newCount >= 10", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

      mockDataQuery(supabase, generateMembership(userId), false);

      // 35 current responses (15 new)
      mockCountQuery(supabase, 35);

      // Mock existing jobs check (no active jobs)
      mockNoExistingJobs(supabase);

      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expectStrategyDecision(result, "full");
      expect(result.newResponsesSinceAnalysis).toBe(15);
    });

    it("chooses full when prerequisites missing", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

      mockDataQuery(supabase, generateMembership(userId), false);

      // 25 current responses (5 new, normally incremental)
      mockCountQuery(supabase, 25);

      // Mock existing jobs check (no active jobs)
      mockNoExistingJobs(supabase);

      // 0 cluster models (prerequisites missing)
      mockCountQuery(supabase, 0);

      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expectStrategyDecision(result, "full");
    });
  });

  describe("authorization", () => {
    it("throws error when conversation not found", async () => {
      const supabase = createMockSupabase();

      // Mock conversation not found
      supabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: "Not found" },
      });

      await expect(
        triggerConversationAnalysis(
          supabase,
          conversationId,
          userId,
          defaultRequest
        )
      ).rejects.toThrow("Conversation not found");
    });

    it("throws error when user not hive member", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(supabase, generateConversation());

      // Mock membership not found
      supabase.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        triggerConversationAnalysis(
          supabase,
          conversationId,
          userId,
          defaultRequest
        )
      ).rejects.toThrow("Unauthorized: not a hive member");
    });

    it("returns already_complete when type is decide", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(supabase, generateConversation({ type: "decide" }));
      mockDataQuery(supabase, generateMembership(userId), false);
      mockCountQuery(supabase, 25);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result.status).toBe("already_complete");
      expect(result.reason).toBe("wrong_type");
    });

    it("returns already_complete when count < threshold", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(supabase, generateConversation());
      mockDataQuery(supabase, generateMembership(userId), false);
      mockCountQuery(supabase, 15); // Below 20

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result.status).toBe("already_complete");
      expect(result.reason).toBe("below_threshold");
    });
  });

  describe("concurrency", () => {
    it("returns already_running when job already exists", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );
      mockDataQuery(supabase, generateMembership(userId), false);
      mockCountQuery(supabase, 25);

      // Mock existing jobs check - returns an active job (step 8 in triggerConversationAnalysis)
      const existingJobsChain = {
        from: supabase.from,
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [{ id: "existing-job-123", status: "queued" }],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(existingJobsChain);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result.status).toBe("already_running");
      expect(result.reason).toBe("in_progress");
    });
  });
});
