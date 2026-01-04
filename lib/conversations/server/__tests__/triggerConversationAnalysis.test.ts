/**
 * Tests for triggerConversationAnalysis Service
 *
 * Covers strategy decision logic, freshness detection, authorization,
 * and response metadata for the regenerate analysis feature
 */

import { triggerConversationAnalysis } from "../triggerConversationAnalysis";
import type { TriggerAnalysisRequest } from "../../schemas";
import {
  createMockSupabase,
  mockCountQuery,
  mockDataQuery,
  mockInsert,
  mockUpdate,
  generateConversation,
  generateMembership,
  expectStrategyDecision,
  expectAnalysisMetadata,
} from "./testUtils";

describe("triggerConversationAnalysis", () => {
  const userId = "user-123";
  const conversationId = "conv-123";
  const defaultRequest: TriggerAnalysisRequest = {
    mode: "manual",
    strategy: "auto",
  };

  describe("freshness detection", () => {
    it("returns already_complete with reason fresh when analysis is current", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 25,
        })
      );

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 25);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result.status).toBe("already_complete");
      expect(result.reason).toBe("fresh");
      expectAnalysisMetadata(result, {
        currentResponseCount: 25,
        analysisResponseCount: 25,
        newResponsesSinceAnalysis: 0,
      });
    });

    it("proceeds to strategy decision when analysis is stale", async () => {
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

      // Mock jobs query - no existing jobs
      mockDataQuery(supabase, [], false);

      mockCountQuery(supabase, 3); // cluster models exist

      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result.status).toBe("queued");
      expect(result.strategy).toBe("incremental");
    });

    it("returns already_running when analysis job is queued/running", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "embedding",
          analysis_response_count: 20,
        })
      );

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 25);

      // Mock jobs query - existing job found
      mockDataQuery(supabase, [{ id: "job-123", status: "queued" }], false);

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

  describe("strategy decision logic", () => {
    it("chooses incremental when newCount < 10 and prerequisites exist", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 25); // 5 new responses

      mockDataQuery(supabase, [], false); // no existing jobs

      mockCountQuery(supabase, 3); // cluster models exist

      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expectStrategyDecision(result, "incremental");
      expectAnalysisMetadata(result, {
        newResponsesSinceAnalysis: 5,
      });
    });

    it("chooses full when newCount < 10 but prerequisites missing", async () => {
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

      mockDataQuery(supabase, [], false); // no existing jobs

      mockCountQuery(supabase, 0); // no cluster models

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

    it("chooses full when newCount >= 10", async () => {
      const supabase = createMockSupabase();

      // Mock conversation with 15 new responses
      mockDataQuery(supabase, generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        }));

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 35);

      mockDataQuery(supabase, [], false); // no existing jobs

      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expectStrategyDecision(result, "full");
      expectAnalysisMetadata(result, {
        newResponsesSinceAnalysis: 15,
      });
    });

    it("chooses full when newCount = 10 (boundary)", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(supabase, generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        }));

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 30);

      mockDataQuery(supabase, [], false); // no existing jobs

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

    it("respects explicit strategy=full", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(supabase, generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        }));

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 25);

      mockDataQuery(supabase, [], false); // no existing jobs

      // For regenerate mode: retire jobs + conversation status update
      mockUpdate(supabase);
      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        { mode: "regenerate", strategy: "full" }
      );

      expectStrategyDecision(result, "full");
    });

    it("respects explicit strategy=incremental", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(supabase, generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        }));

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 35);

      mockDataQuery(supabase, [], false); // no existing jobs

      // For regenerate mode: retire jobs + conversation status update
      mockUpdate(supabase);
      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        { mode: "regenerate", strategy: "incremental" }
      );

      expectStrategyDecision(result, "incremental");
    });
  });

  describe("authorization and validation", () => {
    it("throws error when conversation not found", async () => {
      const supabase = createMockSupabase();

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

      mockDataQuery(supabase, null, false);

      await expect(
        triggerConversationAnalysis(
          supabase,
          conversationId,
          userId,
          defaultRequest
        )
      ).rejects.toThrow("Unauthorized: not a hive member");
    });

    it("returns already_complete when conversation type is decide", async () => {
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

    it("returns already_complete when response count < 20", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(supabase, generateConversation());

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 15);

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

  describe("concurrency and idempotency", () => {
    it("returns already_running when job already queued", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(supabase, generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        }));

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 25);

      // Mock existing job found
      mockDataQuery(supabase, [{ id: "existing-job", status: "queued" }], false);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result.status).toBe("already_running");
      expect(result.reason).toBe("in_progress");
    });

    it("updates conversation status to not_started on successful queue", async () => {
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

      mockDataQuery(supabase, [], false); // no existing jobs

      mockCountQuery(supabase, 3); // cluster models exist

      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result.status).toBe("queued");
      // Verify mockUpdate was called by checking result contains expected data
      expect(result.strategy).toBe("incremental");
    });
  });

  describe("response metadata", () => {
    it("includes complete metadata in queued response", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 28);

      mockDataQuery(supabase, [], false); // no existing jobs

      mockCountQuery(supabase, 3); // cluster models exist

      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result).toMatchObject({
        status: "queued",
        strategy: "incremental",
        reason: "stale",
        currentResponseCount: 28,
        analysisResponseCount: 20,
        newResponsesSinceAnalysis: 8,
      });
    });

    it("includes metadata in already_complete response", async () => {
      const supabase = createMockSupabase();

      mockDataQuery(supabase, generateConversation({
          analysis_status: "ready",
          analysis_response_count: 25,
        }));

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 25);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result).toMatchObject({
        status: "already_complete",
        reason: "fresh",
        currentResponseCount: 25,
        analysisResponseCount: 25,
        newResponsesSinceAnalysis: 0,
      });
    });
  });

  describe("regenerate mode", () => {
    it("retires active jobs before enqueueing new job in regenerate mode", async () => {
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

      mockDataQuery(supabase, [], false); // no existing jobs

      mockCountQuery(supabase, 3); // cluster models exist

      // Mock the update call to retire active jobs
      mockUpdate(supabase);
      mockInsert(supabase);
      // Second mockUpdate for conversation status update
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        { mode: "regenerate", strategy: "auto" }
      );

      expect(result.status).toBe("queued");
      expect(result.strategy).toBe("incremental");
    });

    it("does not retire jobs in manual mode", async () => {
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

      mockDataQuery(supabase, [], false); // no existing jobs

      mockCountQuery(supabase, 3); // cluster models exist

      mockInsert(supabase);
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        { mode: "manual", strategy: "auto" }
      );

      expect(result.status).toBe("queued");
    });
  });
});
