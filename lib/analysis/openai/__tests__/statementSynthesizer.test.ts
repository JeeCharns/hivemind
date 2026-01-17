/**
 * Tests for Statement Synthesizer
 */

import type OpenAI from "openai";
import {
  synthesizeStatement,
  synthesizeStatements,
  DEFAULT_SYNTHESIS_PARAMS,
} from "../statementSynthesizer";
import type { ConsolidationInput } from "@/lib/conversations/domain/statementConsolidation";

// Mock OpenAI client
function createMockOpenAI(
  mockResponse?: string,
  shouldThrow = false
): OpenAI {
  return {
    chat: {
      completions: {
        create: jest.fn().mockImplementation(async () => {
          if (shouldThrow) {
            throw new Error("API error");
          }
          return {
            choices: [
              {
                message: {
                  content: mockResponse ?? '{"statement": "Synthesized statement"}',
                },
              },
            ],
          };
        }),
      },
    },
  } as unknown as OpenAI;
}

describe("statementSynthesizer", () => {
  describe("DEFAULT_SYNTHESIS_PARAMS", () => {
    it("has expected default values", () => {
      expect(DEFAULT_SYNTHESIS_PARAMS.model).toBe("gpt-4o-mini");
      expect(DEFAULT_SYNTHESIS_PARAMS.promptVersion).toBe("v1.0");
    });
  });

  describe("synthesizeStatement", () => {
    it("returns empty string for empty responses array", async () => {
      const mockClient = createMockOpenAI();
      const result = await synthesizeStatement(mockClient, []);

      expect(result.synthesizedStatement).toBe("");
      expect(mockClient.chat.completions.create).not.toHaveBeenCalled();
    });

    it("returns the response text for single-item array", async () => {
      const mockClient = createMockOpenAI();
      const result = await synthesizeStatement(mockClient, [
        "Only one response",
      ]);

      expect(result.synthesizedStatement).toBe("Only one response");
      expect(mockClient.chat.completions.create).not.toHaveBeenCalled();
    });

    it("calls OpenAI for multiple responses", async () => {
      const mockClient = createMockOpenAI('{"statement": "Combined meaning"}');
      const result = await synthesizeStatement(mockClient, [
        "First response",
        "Second response",
      ]);

      expect(result.synthesizedStatement).toBe("Combined meaning");
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it("uses correct model and temperature", async () => {
      const mockClient = createMockOpenAI('{"statement": "Test"}');
      await synthesizeStatement(mockClient, ["First", "Second"]);

      const call = (mockClient.chat.completions.create as jest.Mock).mock
        .calls[0][0];
      expect(call.model).toBe("gpt-4o-mini");
      expect(call.temperature).toBe(0.3);
      expect(call.response_format).toEqual({ type: "json_object" });
    });

    it("includes all responses in prompt", async () => {
      const mockClient = createMockOpenAI('{"statement": "Test"}');
      await synthesizeStatement(mockClient, [
        "First response",
        "Second response",
        "Third response",
      ]);

      const call = (mockClient.chat.completions.create as jest.Mock).mock
        .calls[0][0];
      const userMessage = call.messages[1].content;

      expect(userMessage).toContain('1. "First response"');
      expect(userMessage).toContain('2. "Second response"');
      expect(userMessage).toContain('3. "Third response"');
    });

    it("falls back to first response on API error", async () => {
      const mockClient = createMockOpenAI("", true);
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await synthesizeStatement(mockClient, [
        "First response",
        "Second response",
      ]);

      expect(result.synthesizedStatement).toBe("First response");
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("falls back to first response on invalid JSON", async () => {
      const mockClient = createMockOpenAI("not valid json");
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await synthesizeStatement(mockClient, [
        "First response",
        "Second response",
      ]);

      expect(result.synthesizedStatement).toBe("First response");
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("falls back to first response when statement field is missing", async () => {
      const mockClient = createMockOpenAI('{"other_field": "value"}');

      const result = await synthesizeStatement(mockClient, [
        "First response",
        "Second response",
      ]);

      expect(result.synthesizedStatement).toBe("First response");
    });
  });

  describe("synthesizeStatements", () => {
    it("returns empty array for empty input", async () => {
      const mockClient = createMockOpenAI();
      const result = await synthesizeStatements(mockClient, []);

      expect(result).toEqual([]);
    });

    it("processes multiple groups in parallel", async () => {
      const mockClient = createMockOpenAI('{"statement": "Combined"}');
      const groups: ConsolidationInput[] = [
        {
          groupId: "g1",
          clusterIndex: 0,
          representativeId: "1",
          responses: [
            { id: "1", text: "First" },
            { id: "2", text: "Second" },
          ],
        },
        {
          groupId: "g2",
          clusterIndex: 1,
          representativeId: "3",
          responses: [
            { id: "3", text: "Third" },
            { id: "4", text: "Fourth" },
          ],
        },
      ];

      const result = await synthesizeStatements(mockClient, groups);

      expect(result).toHaveLength(2);
      expect(result[0].groupId).toBe("g1");
      expect(result[1].groupId).toBe("g2");
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(2);
    });

    it("builds complete consolidation output", async () => {
      const mockClient = createMockOpenAI('{"statement": "Synthesized text"}');
      const groups: ConsolidationInput[] = [
        {
          groupId: "group-123",
          clusterIndex: 2,
          representativeId: "r1",
          responses: [
            { id: "r1", text: "Response one" },
            { id: "r2", text: "Response two" },
          ],
        },
      ];

      const result = await synthesizeStatements(mockClient, groups);

      expect(result[0]).toEqual({
        groupId: "group-123",
        synthesizedStatement: "Synthesized text",
        combinedResponseIds: ["r1", "r2"],
        combinedResponses: "r1: Response one | r2: Response two",
      });
    });

    it("handles partial failures gracefully", async () => {
      // Create a mock that fails on second call
      let callCount = 0;
      const mockClient = {
        chat: {
          completions: {
            create: jest.fn().mockImplementation(async () => {
              callCount++;
              if (callCount === 2) {
                throw new Error("API error");
              }
              return {
                choices: [
                  { message: { content: '{"statement": "Success"}' } },
                ],
              };
            }),
          },
        },
      } as unknown as OpenAI;

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      const groups: ConsolidationInput[] = [
        {
          groupId: "g1",
          clusterIndex: 0,
          representativeId: "1",
          responses: [
            { id: "1", text: "First" },
            { id: "2", text: "Second" },
          ],
        },
        {
          groupId: "g2",
          clusterIndex: 1,
          representativeId: "3",
          responses: [
            { id: "3", text: "Third" },
            { id: "4", text: "Fourth" },
          ],
        },
      ];

      const result = await synthesizeStatements(mockClient, groups);

      // Both should be returned - one success, one fallback
      expect(result).toHaveLength(2);
      expect(result[0].synthesizedStatement).toBe("Success");
      expect(result[1].synthesizedStatement).toBe("Third"); // Fallback to first response

      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
});
