/**
 * Cluster Consolidator - LLM-Driven Semantic Grouping
 *
 * Analyzes all responses within a cluster and groups them into
 * semantic buckets, then generates consolidated statements for each bucket.
 *
 * Unlike similarity-threshold grouping, this approach:
 * - Lets the LLM decide semantic groupings (handles novel phrasing)
 * - Consolidates most/all responses in a cluster
 * - Creates meaningful buckets based on the actual content
 */

import OpenAI from "openai";

/**
 * A response within a cluster to be consolidated
 */
export interface ClusterResponse {
  id: string;
  text: string;
}

/**
 * A semantic bucket identified by the LLM
 */
export interface SemanticBucket {
  bucketName: string;
  consolidatedStatement: string;
  responseIds: string[];
}

/**
 * Result of consolidating a single cluster
 */
export interface ClusterConsolidationResult {
  clusterIndex: number;
  buckets: SemanticBucket[];
  unconsolidatedIds: string[]; // Responses that didn't fit any bucket
}

/**
 * Parameters for cluster consolidation
 */
export interface ClusterConsolidationParams {
  model: string;
  promptVersion: string;
  maxResponsesPerCall: number; // Limit to manage token usage
}

export const DEFAULT_CLUSTER_CONSOLIDATION_PARAMS: ClusterConsolidationParams = {
  model: "gpt-4o-mini",
  promptVersion: "v2.1",
  maxResponsesPerCall: 50, // Balance between coverage and token limits
};

/**
 * Consolidate all responses within a cluster into semantic buckets
 *
 * @param client - OpenAI client
 * @param clusterIndex - The cluster being processed
 * @param responses - All responses in this cluster
 * @param params - Consolidation parameters
 * @returns Consolidation result with semantic buckets
 */
export async function consolidateCluster(
  client: OpenAI,
  clusterIndex: number,
  responses: ClusterResponse[],
  params: ClusterConsolidationParams = DEFAULT_CLUSTER_CONSOLIDATION_PARAMS
): Promise<ClusterConsolidationResult> {
  // Handle edge cases
  if (responses.length === 0) {
    return {
      clusterIndex,
      buckets: [],
      unconsolidatedIds: [],
    };
  }

  if (responses.length === 1) {
    // Single response becomes its own bucket
    return {
      clusterIndex,
      buckets: [
        {
          bucketName: "Single response",
          consolidatedStatement: responses[0].text,
          responseIds: [responses[0].id],
        },
      ],
      unconsolidatedIds: [],
    };
  }

  // For large clusters, we may need to batch (future enhancement)
  // For now, take up to maxResponsesPerCall responses
  const responsesToProcess = responses.slice(0, params.maxResponsesPerCall);

  // Debug: log sample of IDs being sent
  console.log(
    `[consolidateCluster] Cluster ${clusterIndex}: processing ${responsesToProcess.length} responses, sample IDs: ${responsesToProcess.slice(0, 3).map((r) => r.id).join(", ")}`
  );

  const prompt = buildConsolidationPrompt(responsesToProcess);

  try {
    const response = await client.chat.completions.create({
      model: params.model,
      messages: [
        {
          role: "system",
          content: `You are an expert at analyzing user feedback and identifying common themes. Your task is to:
1. Group similar responses into semantic buckets based on the core idea they express
2. Create a consolidated statement for each bucket that captures all the distinct points
3. Ensure traceability by correctly mapping response IDs to buckets

Guidelines:
- Group responses by their core meaning, not just similar words
- A response can only belong to ONE bucket
- Create as few buckets as needed while preserving distinct viewpoints
- Do NOT add opinions or information not present in the original responses
- Responses that are truly unique and don't fit any group should go in "unconsolidated_ids"

Voice and tone:
- Match the tense and voice of the original responses. If responses consistently use first-person ("We need...", "We want..."), use first-person. If they use direct statements ("Need X", "Want Y"), keep that directness.
- Only use summary language ("There is a need for...") when the original voices are mixed or varied.

Conciseness:
- Keep consolidated statements concise. If the original responses are short, the consolidated statement should be similarly brief.
- Only expand when necessary to capture distinct points not covered by a shorter phrasing.`,
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Low for consistency
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);
    return parseConsolidationResponse(clusterIndex, parsed, responsesToProcess);
  } catch (error) {
    console.error(
      `[consolidateCluster] Failed for cluster ${clusterIndex}:`,
      error
    );

    // Fallback: each response becomes its own bucket
    return {
      clusterIndex,
      buckets: responses.map((r) => ({
        bucketName: "Uncategorized",
        consolidatedStatement: r.text,
        responseIds: [r.id],
      })),
      unconsolidatedIds: [],
    };
  }
}

/**
 * Build the prompt for cluster consolidation
 */
function buildConsolidationPrompt(responses: ClusterResponse[]): string {
  const responseList = responses
    .map((r) => `[ID: ${r.id}] "${r.text}"`)
    .join("\n");

  return `Analyze these ${responses.length} user responses and group them into semantic buckets.

CRITICAL: Each response has a unique ID shown in brackets like [ID: abc123]. You MUST use these EXACT IDs in your response. Do NOT create new IDs or modify them.

Responses to analyze:
${responseList}

For each bucket, create a consolidated statement that:
- Preserves ALL distinct points from the grouped responses
- Matches the voice/tense of the originals (first-person if they use "we", direct if they're direct)
- Stays concise - don't pad short responses into longer summaries

Respond in JSON format:
{
  "buckets": [
    {
      "bucket_name": "Short descriptive name (2-5 words)",
      "consolidated_statement": "A clear statement capturing all points from grouped responses",
      "response_ids": ["exact-id-from-input", "another-exact-id", ...]
    }
  ],
  "unconsolidated_ids": ["exact-id-of-any-response-that-doesnt-fit"]
}

IMPORTANT RULES:
1. Use the EXACT IDs from the input (copy them exactly as shown in [ID: xxx])
2. Every response ID must appear exactly once (either in a bucket or unconsolidated)
3. Aim to consolidate most responses - only leave truly unique ones unconsolidated
4. Group responses by meaning, not just similar keywords`;
}

/**
 * Parse and validate the LLM response
 */
function parseConsolidationResponse(
  clusterIndex: number,
  parsed: unknown,
  originalResponses: ClusterResponse[]
): ClusterConsolidationResult {
  const result: ClusterConsolidationResult = {
    clusterIndex,
    buckets: [],
    unconsolidatedIds: [],
  };

  if (!parsed || typeof parsed !== "object") {
    console.error("[parseConsolidationResponse] Invalid response format");
    return fallbackResult(clusterIndex, originalResponses);
  }

  const data = parsed as Record<string, unknown>;

  // Build set of valid response IDs from original input
  // IMPORTANT: Normalize IDs to strings for consistent comparison
  const validIds = new Set(originalResponses.map((r) => String(r.id)));

  // Debug: log first few valid IDs to see their format
  const sampleValidIds = [...validIds].slice(0, 3);
  console.log(
    `[parseConsolidationResponse] Valid ID samples: ${sampleValidIds.join(", ")} (type: ${typeof sampleValidIds[0]})`
  );

  // Parse buckets, filtering out any hallucinated/invalid IDs
  if (Array.isArray(data.buckets)) {
    for (const bucket of data.buckets) {
      if (
        bucket &&
        typeof bucket === "object" &&
        typeof (bucket as Record<string, unknown>).bucket_name === "string" &&
        typeof (bucket as Record<string, unknown>).consolidated_statement ===
          "string" &&
        Array.isArray((bucket as Record<string, unknown>).response_ids)
      ) {
        const b = bucket as Record<string, unknown>;
        const rawIds = (b.response_ids as unknown[]).map(String);

        // Debug: log first raw ID and check if it's in validIds
        if (rawIds.length > 0) {
          const firstRaw = rawIds[0];
          const isInValid = validIds.has(firstRaw);
          console.log(
            `[parseConsolidationResponse] First raw ID: "${firstRaw}" (type: ${typeof firstRaw}), in validIds: ${isInValid}`
          );
        }

        // Filter to only valid IDs (prevent LLM hallucinations)
        const validResponseIds = rawIds.filter((id) => validIds.has(id));
        const invalidIds = rawIds.filter((id) => !validIds.has(id));

        if (invalidIds.length > 0) {
          console.warn(
            `[parseConsolidationResponse] Filtered out ${invalidIds.length} invalid/hallucinated IDs from bucket "${b.bucket_name}": ${invalidIds.slice(0, 5).join(", ")}${invalidIds.length > 5 ? "..." : ""}`
          );
        }

        // Only add bucket if it has at least one valid response
        if (validResponseIds.length > 0) {
          result.buckets.push({
            bucketName: b.bucket_name as string,
            consolidatedStatement: b.consolidated_statement as string,
            responseIds: validResponseIds,
          });
        }
      }
    }
  }

  // Parse unconsolidated IDs, filtering out invalid ones
  if (Array.isArray(data.unconsolidated_ids)) {
    const rawUnconsolidated = data.unconsolidated_ids.map(String);
    result.unconsolidatedIds = rawUnconsolidated.filter((id) =>
      validIds.has(id)
    );

    const invalidUnconsolidated = rawUnconsolidated.filter(
      (id) => !validIds.has(id)
    );
    if (invalidUnconsolidated.length > 0) {
      console.warn(
        `[parseConsolidationResponse] Filtered out ${invalidUnconsolidated.length} invalid/hallucinated unconsolidated IDs`
      );
    }
  }

  // Validate: ensure all original response IDs are accounted for
  const allAssignedIds = new Set<string>();
  for (const bucket of result.buckets) {
    for (const id of bucket.responseIds) {
      allAssignedIds.add(id);
    }
  }
  for (const id of result.unconsolidatedIds) {
    allAssignedIds.add(id);
  }

  const missingIds = [...validIds].filter((id) => !allAssignedIds.has(id));

  if (missingIds.length > 0) {
    console.warn(
      `[parseConsolidationResponse] ${missingIds.length} response IDs missing from LLM output, adding to unconsolidated`
    );
    result.unconsolidatedIds.push(...missingIds);
  }

  return result;
}

/**
 * Fallback result when LLM fails
 */
function fallbackResult(
  clusterIndex: number,
  responses: ClusterResponse[]
): ClusterConsolidationResult {
  return {
    clusterIndex,
    buckets: responses.map((r) => ({
      bucketName: "Uncategorized",
      consolidatedStatement: r.text,
      responseIds: [r.id],
    })),
    unconsolidatedIds: [],
  };
}

/**
 * Consolidate multiple clusters in parallel
 *
 * @param client - OpenAI client
 * @param clusterResponses - Map of cluster index to responses
 * @param params - Consolidation parameters
 * @returns Array of consolidation results
 */
export async function consolidateClusters(
  client: OpenAI,
  clusterResponses: Map<number, ClusterResponse[]>,
  params: ClusterConsolidationParams = DEFAULT_CLUSTER_CONSOLIDATION_PARAMS
): Promise<ClusterConsolidationResult[]> {
  if (clusterResponses.size === 0) {
    return [];
  }

  console.log(
    `[consolidateClusters] Consolidating ${clusterResponses.size} clusters`
  );

  const promises = Array.from(clusterResponses.entries()).map(
    ([clusterIndex, responses]) =>
      consolidateCluster(client, clusterIndex, responses, params)
  );

  const results = await Promise.allSettled(promises);

  const consolidationResults: ClusterConsolidationResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      consolidationResults.push(result.value);
      successCount++;
    } else {
      console.error(
        "[consolidateClusters] Cluster consolidation failed:",
        result.reason
      );
      failureCount++;
    }
  }

  console.log(
    `[consolidateClusters] Completed: ${successCount} succeeded, ${failureCount} failed`
  );

  // Log stats
  const totalBuckets = consolidationResults.reduce(
    (sum, r) => sum + r.buckets.length,
    0
  );
  const totalConsolidated = consolidationResults.reduce(
    (sum, r) =>
      sum + r.buckets.reduce((s, b) => s + b.responseIds.length, 0),
    0
  );
  const totalUnconsolidated = consolidationResults.reduce(
    (sum, r) => sum + r.unconsolidatedIds.length,
    0
  );

  console.log(`[consolidateClusters] Stats:`, {
    clusters: consolidationResults.length,
    totalBuckets,
    totalConsolidated,
    totalUnconsolidated,
    consolidationRate: `${((totalConsolidated / (totalConsolidated + totalUnconsolidated)) * 100).toFixed(1)}%`,
  });

  return consolidationResults;
}
