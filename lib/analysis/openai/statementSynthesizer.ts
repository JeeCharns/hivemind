/**
 * Statement Synthesizer with OpenAI
 *
 * Generates consolidated statements from similar responses within topic clusters.
 * Follows patterns from themeGenerator.ts:
 * - Client injection for testability
 * - JSON response format
 * - Promise.allSettled for parallel processing
 * - Graceful fallback on errors
 */

import OpenAI from "openai";
import type {
  ConsolidationInput,
  ConsolidationOutput,
} from "@/lib/conversations/domain/statementConsolidation";
import { buildConsolidationOutput } from "@/lib/conversations/domain/statementConsolidation";

/**
 * Result from synthesizing a single statement
 */
export interface SynthesisResult {
  synthesizedStatement: string;
}

/**
 * Parameters for synthesis (for observability)
 */
export interface SynthesisParams {
  model: string;
  promptVersion: string;
}

export const DEFAULT_SYNTHESIS_PARAMS: SynthesisParams = {
  model: "gpt-4o-mini",
  promptVersion: "v1.0",
};

/**
 * Synthesize a consolidated statement from similar responses
 *
 * @param client - OpenAI client (injected for testability)
 * @param responses - Array of similar response texts
 * @returns Synthesized statement
 */
export async function synthesizeStatement(
  client: OpenAI,
  responses: string[]
): Promise<SynthesisResult> {
  // Edge cases
  if (responses.length === 0) {
    return { synthesizedStatement: "" };
  }

  if (responses.length === 1) {
    return { synthesizedStatement: responses[0] };
  }

  const prompt = `You are consolidating similar user feedback responses into a single statement.

These responses all express similar ideas:
${responses.map((r, i) => `${i + 1}. "${r}"`).join("\n")}

Create a single consolidated statement that:
1. Preserves ALL distinct points made across the responses
2. Uses clear, neutral language
3. Does NOT add new information, opinions, or interpretations
4. Maintains the original sentiment and meaning
5. Is concise but complete (1-3 sentences)

The consolidated statement should read naturally and cover everything the original responses expressed.

Respond in JSON format:
{
  "statement": "The consolidated statement here"
}`;

  try {
    const response = await client.chat.completions.create({
      model: DEFAULT_SYNTHESIS_PARAMS.model,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that consolidates similar user feedback while preserving all distinct points. You never add new information or opinions.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Low temperature for consistency
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);

    return {
      synthesizedStatement: parsed.statement || responses[0],
    };
  } catch (error) {
    console.error("[synthesizeStatement] Failed:", error);
    // Fallback: use first response as representative
    return { synthesizedStatement: responses[0] };
  }
}

/**
 * Synthesize statements for multiple groups in parallel
 *
 * Uses Promise.allSettled to handle partial failures gracefully.
 * Failed groups fall back to their first response.
 *
 * @param client - OpenAI client
 * @param groups - Groups to synthesize
 * @returns Consolidation outputs with synthesized statements
 */
export async function synthesizeStatements(
  client: OpenAI,
  groups: ConsolidationInput[]
): Promise<ConsolidationOutput[]> {
  if (groups.length === 0) {
    return [];
  }

  console.log(
    `[synthesizeStatements] Synthesizing ${groups.length} groups in parallel`
  );

  const promises = groups.map(async (group) => {
    const responseTexts = group.responses.map((r) => r.text);
    const result = await synthesizeStatement(client, responseTexts);

    return buildConsolidationOutput(group, result.synthesizedStatement);
  });

  const results = await Promise.allSettled(promises);

  const outputs: ConsolidationOutput[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const group = groups[i];

    if (result.status === "fulfilled") {
      outputs.push(result.value);
      successCount++;
    } else {
      // Fallback: use first response text
      console.error(
        `[synthesizeStatements] Failed for group ${group.groupId}:`,
        result.reason
      );
      outputs.push(
        buildConsolidationOutput(group, group.responses[0]?.text || "")
      );
      failureCount++;
    }
  }

  console.log(
    `[synthesizeStatements] Completed: ${successCount} succeeded, ${failureCount} failed`
  );

  return outputs;
}
