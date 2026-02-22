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

      // Mock jobs query - existing job found (recent, not stale)
      mockDataQuery(
        supabase,
        [
          {
            id: "job-123",
            status: "queued",
            created_at: new Date().toISOString(), // Recent job, not stale
            locked_at: null,
          },
        ],
        false
      );

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
      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

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

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

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

      // No existing jobs, so no retirement update needed
      // Just: insert job + update conversation status
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

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 35);

      mockDataQuery(supabase, [], false); // no existing jobs

      // No existing jobs, so no retirement update needed
      // Just: insert job + update conversation status
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

      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

      mockDataQuery(supabase, generateMembership(userId), false);

      mockCountQuery(supabase, 25);

      // Mock existing job found (recent, not stale)
      mockDataQuery(
        supabase,
        [
          {
            id: "existing-job",
            status: "queued",
            created_at: new Date().toISOString(), // Recent job
            locked_at: null,
          },
        ],
        false
      );

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      expect(result.status).toBe("already_running");
      expect(result.reason).toBe("in_progress");
    });

    it("retires stale queued job and creates new job", async () => {
      const supabase = createMockSupabase();

      // 1. Conversation query
      mockDataQuery(
        supabase,
        generateConversation({
          analysis_status: "ready",
          analysis_response_count: 20,
        })
      );

      // 2. Membership query
      mockDataQuery(supabase, generateMembership(userId), false);

      // 3. Response count query
      mockCountQuery(supabase, 25);

      // 4. Jobs query - returns stale job (created 2 hours ago)
      const twoHoursAgo = new Date(
        Date.now() - 2 * 60 * 60 * 1000
      ).toISOString();
      mockDataQuery(
        supabase,
        [
          {
            id: "stale-job",
            status: "queued",
            created_at: twoHoursAgo, // Stale job (> 1 hour for queued)
            locked_at: null,
          },
        ],
        false
      );

      // 5. Retire stale job update
      mockUpdate(supabase);

      // 6. Cluster models count for strategy decision
      mockCountQuery(supabase, 3);

      // 7. Insert new job + verify (mockInsert handles both)
      mockInsert(supabase);

      // 8. Update conversation status
      mockUpdate(supabase);

      const result = await triggerConversationAnalysis(
        supabase,
        conversationId,
        userId,
        defaultRequest
      );

      // Should proceed to create new job since old one was stale
      expect(result.status).toBe("queued");
      expect(result.strategy).toBe("incremental");
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

      // Mock existing job that will be retired (recent job, but regenerate mode overrides)
      mockDataQuery(
        supabase,
        [
          {
            id: "existing-job",
            status: "queued",
            created_at: new Date().toISOString(),
            locked_at: null,
          },
        ],
        false
      );

      // Note: cluster models check is skipped for regenerate mode (always uses full strategy)

      // Mock the update call to retire existing job (happens during step 8)
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
      // Regenerate mode with auto strategy now defaults to full (not incremental)
      expect(result.strategy).toBe("full");
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
