/**
 * Generate Explore Report
 *
 * Server function to automatically generate reports for explore conversations
 * Called after analysis completes
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropicClient } from "@/lib/ai/anthropic";
import {
  buildExploreReportPrompt,
  EXPLORE_REPORT_SYSTEM_PROMPT,
  type ExploreReportPromptData,
} from "@/lib/conversations/prompts/exploreReportPrompt";

interface ClusterModel {
  title: string;
  description: string;
  cluster_index: number;
}

interface ClusterBucket {
  consolidated_statement: string;
  conversation_cluster_bucket_members: Array<{ response_id: number }>;
}

interface Response {
  response_text: string;
  cluster_index: number | null;
}

/**
 * Generate and save a report for an explore conversation
 *
 * @param supabase - Supabase client
 * @param conversationId - Conversation UUID
 * @param createdBy - User ID who triggered the analysis (optional, uses system if not provided)
 */
export async function generateExploreReport(
  supabase: SupabaseClient,
  conversationId: string,
  createdBy?: string
): Promise<{ success: boolean; version?: number; error?: string }> {
  try {
    console.log(
      `[generateExploreReport] Starting report generation for ${conversationId}`
    );

    // 1. Fetch conversation metadata
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("title, type, hive_id")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return { success: false, error: "Conversation not found" };
    }

    if (conversation.type !== "explore") {
      return { success: false, error: "Not an explore conversation" };
    }

    // 2. Count responses and participants
    const { count: responseCount } = await supabase
      .from("conversation_responses")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    const { data: participantData } = await supabase
      .from("conversation_responses")
      .select("user_id")
      .eq("conversation_id", conversationId);

    const participantCount = new Set(
      participantData?.map((r) => r.user_id) || []
    ).size;

    // 3. Fetch themes (cluster models)
    const { data: clusterModels } = await supabase
      .from("conversation_cluster_models")
      .select("title, description, cluster_index")
      .eq("conversation_id", conversationId)
      .order("cluster_index", { ascending: true });

    const themes = (clusterModels || []).map((m: ClusterModel) => ({
      name: m.title || "Untitled",
      description: m.description || "",
      size: 0, // Will be calculated from responses
    }));

    // 4. Fetch cluster buckets (consolidated statements)
    const { data: clusterBuckets } = await supabase
      .from("conversation_cluster_buckets")
      .select(
        `
        consolidated_statement,
        conversation_cluster_bucket_members(response_id)
      `
      )
      .eq("conversation_id", conversationId);

    const consolidatedStatements = (clusterBuckets || []).map(
      (bucket: ClusterBucket) => ({
        statement: bucket.consolidated_statement,
        responseCount: bucket.conversation_cluster_bucket_members?.length || 1,
      })
    );

    // 5. Fetch sample responses
    const { data: responses } = await supabase
      .from("conversation_responses")
      .select("response_text, cluster_index")
      .eq("conversation_id", conversationId)
      .limit(50);

    // Calculate theme sizes
    const clusterCounts = new Map<number, number>();
    for (const r of responses || []) {
      if (r.cluster_index !== null) {
        clusterCounts.set(
          r.cluster_index,
          (clusterCounts.get(r.cluster_index) || 0) + 1
        );
      }
    }
    for (let i = 0; i < themes.length; i++) {
      themes[i].size = clusterCounts.get(i) || 0;
    }

    // Sample responses across themes
    const sampleResponses = sampleResponsesAcrossThemes(responses || [], 20);

    // 6. Build prompt
    const promptData: ExploreReportPromptData = {
      title: conversation.title || "Untitled Conversation",
      responseCount: responseCount || 0,
      participantCount,
      themes,
      consolidatedStatements,
      sampleResponses: sampleResponses.map((r: Response) => r.response_text),
    };

    const userMessage = buildExploreReportPrompt(promptData);

    // 7. Call Claude
    let anthropic;
    try {
      anthropic = getAnthropicClient();
    } catch {
      return { success: false, error: "Anthropic API key not configured" };
    }

    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      temperature: 0.4,
      system: EXPLORE_REPORT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = aiResponse.content.find((block) => block.type === "text");
    let reportHtml = textBlock?.text || "";

    if (!reportHtml) {
      return { success: false, error: "AI generated empty report" };
    }

    // Clean up markdown code fences if present
    reportHtml = reportHtml
      .replace(/^```html\s*/i, "")
      .replace(/^```\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    // 8. Determine next version
    const { data: latestVersion } = await supabase
      .from("conversation_reports")
      .select("version")
      .eq("conversation_id", conversationId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestVersion?.version || 0) + 1;

    // 9. Insert report
    const { data: newReport, error: insertError } = await supabase
      .from("conversation_reports")
      .insert({
        conversation_id: conversationId,
        version: nextVersion,
        html: reportHtml,
        created_by: createdBy || null,
      })
      .select("version")
      .single();

    if (insertError || !newReport) {
      console.error("[generateExploreReport] Insert error:", insertError);
      return { success: false, error: "Failed to save report" };
    }

    console.log(
      `[generateExploreReport] Report v${newReport.version} generated for ${conversationId}`
    );

    return { success: true, version: newReport.version };
  } catch (error) {
    console.error("[generateExploreReport] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Sample responses proportionally across themes
 */
function sampleResponsesAcrossThemes(
  responses: Response[],
  maxSamples: number
): Response[] {
  if (responses.length <= maxSamples) return responses;

  const buckets = new Map<number | null, Response[]>();
  for (const r of responses) {
    const key = r.cluster_index;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  const result: Response[] = [];
  const bucketEntries = [...buckets.entries()];

  let remaining = maxSamples;
  const allocations = bucketEntries.map(([, items]) => {
    const share = Math.max(
      1,
      Math.round((items.length / responses.length) * maxSamples)
    );
    return Math.min(share, items.length);
  });

  const total = allocations.reduce((a, b) => a + b, 0);
  if (total > maxSamples) {
    const scale = maxSamples / total;
    for (let i = 0; i < allocations.length; i++) {
      allocations[i] = Math.max(1, Math.floor(allocations[i] * scale));
    }
  }

  for (let i = 0; i < bucketEntries.length; i++) {
    const items = bucketEntries[i][1];
    const count = Math.min(allocations[i], remaining);
    result.push(...items.slice(0, count));
    remaining -= count;
    if (remaining <= 0) break;
  }

  return result;
}
