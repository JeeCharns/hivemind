/**
 * Unit Tests for getConversationCta
 *
 * Tests the pure CTA logic function in isolation
 * Demonstrates testability through SRP and pure functions
 */

import { getConversationCta } from "./getConversationCta";
import type { ConversationCardData } from "@/types/conversations";

describe("getConversationCta", () => {
  const hiveKey = "test-hive";
  const baseConversation: ConversationCardData = {
    id: "conv-123",
    slug: "test-conv",
    type: "understand",
    title: "Test Conversation",
    description: "Test description",
    created_at: "2025-01-01T00:00:00Z",
    analysis_status: "not_started",
    report_json: null,
  };

  describe("Report ready state", () => {
    it("should return 'Result ready' label but navigate to listen when report_json exists", () => {
      const conversation: ConversationCardData = {
        ...baseConversation,
        report_json: { some: "data" },
        analysis_status: "ready",
      };

      const result = getConversationCta(hiveKey, conversation);

      expect(result).toEqual({
        label: "Result ready",
        href: "/hives/test-hive/conversations/test-conv/listen",
      });
    });

    it("should prioritize report label over analysis status label", () => {
      const conversation: ConversationCardData = {
        ...baseConversation,
        report_json: { some: "data" },
        analysis_status: "ready",
      };

      const result = getConversationCta(hiveKey, conversation);

      expect(result.label).toBe("Result ready");
      expect(result.href).toContain("/listen");
    });
  });

  describe("Analysis ready state", () => {
    it("should return 'Analysis complete' label but navigate to listen when analysis is ready", () => {
      const conversation: ConversationCardData = {
        ...baseConversation,
        analysis_status: "ready",
        report_json: null,
      };

      const result = getConversationCta(hiveKey, conversation);

      expect(result).toEqual({
        label: "Analysis complete",
        href: "/hives/test-hive/conversations/test-conv/listen",
      });
    });

    it("should not show analysis label when status is embedding", () => {
      const conversation: ConversationCardData = {
        ...baseConversation,
        analysis_status: "embedding",
      };

      const result = getConversationCta(hiveKey, conversation);

      expect(result.label).not.toBe("Analysis complete");
      expect(result.href).toContain("/listen");
    });
  });

  describe("Default state (data collection)", () => {
    it("should return 'Submit your thoughts!' CTA when no report or analysis", () => {
      const conversation: ConversationCardData = {
        ...baseConversation,
        analysis_status: "not_started",
        report_json: null,
      };

      const result = getConversationCta(hiveKey, conversation);

      expect(result).toEqual({
        label: "Submit your thoughts!",
        href: "/hives/test-hive/conversations/test-conv/listen",
      });
    });

    it("should return default CTA when analysis is analyzing", () => {
      const conversation: ConversationCardData = {
        ...baseConversation,
        analysis_status: "analyzing",
      };

      const result = getConversationCta(hiveKey, conversation);

      expect(result.label).toBe("Submit your thoughts!");
      expect(result.href).toContain("/listen");
    });
  });

  describe("Slug vs ID handling", () => {
    it("should use slug when available", () => {
      const conversation: ConversationCardData = {
        ...baseConversation,
        slug: "my-slug",
        id: "uuid-123",
      };

      const result = getConversationCta(hiveKey, conversation);

      expect(result.href).toContain("/conversations/my-slug/");
    });

    it("should fall back to ID when slug is null", () => {
      const conversation: ConversationCardData = {
        ...baseConversation,
        slug: null,
        id: "uuid-123",
      };

      const result = getConversationCta(hiveKey, conversation);

      expect(result.href).toContain("/conversations/uuid-123/");
    });
  });

  describe("Different conversation types", () => {
    it("should work correctly for 'decide' type conversations", () => {
      const conversation: ConversationCardData = {
        ...baseConversation,
        type: "decide",
      };

      const result = getConversationCta(hiveKey, conversation);

      // CTA logic doesn't change based on type
      expect(result.label).toBe("Submit your thoughts!");
    });

    it("should work correctly for 'understand' type conversations", () => {
      const conversation: ConversationCardData = {
        ...baseConversation,
        type: "understand",
      };

      const result = getConversationCta(hiveKey, conversation);

      expect(result.label).toBe("Submit your thoughts!");
    });
  });
});
