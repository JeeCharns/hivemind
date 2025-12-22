/**
 * Get Understand View Model - Server Data Assembly
 *
 * Fetches and aggregates all data needed for the Understand tab
 * Follows SRP: single function to build complete view model
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  UnderstandViewModel,
  ResponsePoint,
  ThemeRow,
  FeedbackItem,
  FeedbackCounts,
  Feedback,
  FrequentlyMentionedGroup,
} from "@/types/conversation-understand";
import { requireHiveMember } from "./requireHiveMember";
import { UNDERSTAND_MIN_RESPONSES } from "../domain/thresholds";
import { DEFAULT_GROUPING_PARAMS } from "@/lib/conversations/domain/similarityGrouping";

interface ResponseRow {
  id: string | number;
  response_text: string;
  tag: string | null;
  cluster_index: number | null;
  x_umap: number | null;
  y_umap: number | null;
}

interface ThemeDbRow {
  cluster_index: number;
  name: string | null;
  description: string | null;
  size: number | null;
}

interface FeedbackRow {
  response_id: string | number;
  feedback: string;
  user_id: string;
}

interface ConversationResponseGroupMemberRow {
  response_id: string | number;
}

interface ConversationResponseGroupRow {
  id: string | number;
  cluster_index: number;
  representative_response_id: string | number;
  group_size: number;
  params: unknown;
  conversation_response_group_members?: ConversationResponseGroupMemberRow[] | null;
}

function parseAnalysisStatus(value: unknown): UnderstandViewModel["analysisStatus"] {
  switch (value) {
    case "not_started":
    case "embedding":
    case "analyzing":
    case "ready":
    case "error":
    case null:
      return value;
    default:
      return null;
  }
}

function normalizeGroupingParams(value: unknown): FrequentlyMentionedGroup["params"] {
  if (!value || typeof value !== "object") {
    return {
      simThreshold: DEFAULT_GROUPING_PARAMS.simThreshold,
      minGroupSize: DEFAULT_GROUPING_PARAMS.minGroupSize,
      algorithmVersion: DEFAULT_GROUPING_PARAMS.algorithmVersion,
    };
  }

  const record = value as Record<string, unknown>;

  const simThreshold =
    typeof record.simThreshold === "number"
      ? record.simThreshold
      : typeof record.sim_threshold === "number"
        ? record.sim_threshold
        : DEFAULT_GROUPING_PARAMS.simThreshold;

  const minGroupSize =
    typeof record.minGroupSize === "number"
      ? record.minGroupSize
      : typeof record.min_group_size === "number"
        ? record.min_group_size
        : DEFAULT_GROUPING_PARAMS.minGroupSize;

  const algorithmVersion =
    typeof record.algorithmVersion === "string"
      ? record.algorithmVersion
      : typeof record.algorithm_version === "string"
        ? record.algorithm_version
        : DEFAULT_GROUPING_PARAMS.algorithmVersion;

  return { simThreshold, minGroupSize, algorithmVersion };
}

/**
 * Assembles the complete Understand view model
 *
 * @param supabase - Supabase client with service role
 * @param conversationId - Conversation UUID
 * @param userId - Current user's UUID
 * @returns Complete view model with responses, themes, and feedback
 */
export async function getUnderstandViewModel(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<UnderstandViewModel> {
  // 1. Verify conversation exists and get hive_id + analysis metadata
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, hive_id, analysis_status, analysis_error, analysis_response_count, analysis_updated_at")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found");
  }

  // 2. Verify user is a member of the hive
  await requireHiveMember(supabase, userId, conversation.hive_id);

  // 3. Fetch all data in parallel
  const [responsesResult, themesResult, feedbackResult, countResult, groupsResult] = await Promise.all([
    // Fetch responses with UMAP coordinates
    supabase
      .from("conversation_responses")
      .select("id, response_text, tag, cluster_index, x_umap, y_umap")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }),

    // Fetch themes
    supabase
      .from("conversation_themes")
      .select("cluster_index, name, description, size")
      .eq("conversation_id", conversationId)
      .order("cluster_index", { ascending: true }),

    // Fetch all feedback for this conversation
    supabase
      .from("response_feedback")
      .select("response_id, feedback, user_id")
      .eq("conversation_id", conversationId),

    // Count total responses for staleness check
    supabase
      .from("conversation_responses")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId),

    // Fetch frequently mentioned groups
    supabase
      .from("conversation_response_groups")
      .select(`
        id,
        cluster_index,
        representative_response_id,
        group_size,
        params,
        conversation_response_group_members(response_id)
      `)
      .eq("conversation_id", conversationId)
      .order("cluster_index", { ascending: true }),
  ]);

  if (responsesResult.error) {
    throw new Error("Failed to fetch responses");
  }

  if (themesResult.error) {
    throw new Error("Failed to fetch themes");
  }

  if (feedbackResult.error) {
    throw new Error("Failed to fetch feedback");
  }

  if (countResult.error) {
    throw new Error("Failed to count responses");
  }

  if (groupsResult.error) {
    console.error("[getUnderstandViewModel] Failed to fetch groups:", groupsResult.error);
    // Don't throw - groups are optional feature
  }

  const responses = (responsesResult.data || []) as ResponseRow[];
  const themes = (themesResult.data || []) as ThemeDbRow[];
  const feedbackRows = (feedbackResult.data || []) as FeedbackRow[];
  const responseCount = countResult.count ?? 0;
  const groupsData = (groupsResult.data || []) as ConversationResponseGroupRow[];

  // Normalize response IDs to strings (Supabase can return BIGINT ids as numbers)
  const normalizedResponses = responses.map((r) => ({
    ...r,
    id: String(r.id),
  }));

  // 4. Calculate staleness metadata
  const analysisResponseCount = conversation.analysis_response_count;
  const analyzedCount = analysisResponseCount ?? 0;
  const newResponsesSinceAnalysis = Math.max(0, responseCount - analyzedCount);
  const isAnalysisStale =
    conversation.analysis_status === "ready" && analyzedCount < responseCount;

  // 5. Build response points
  const responsePoints: ResponsePoint[] = normalizedResponses.map((r) => ({
    id: r.id,
    responseText: r.response_text,
    tag: r.tag,
    clusterIndex: r.cluster_index,
    xUmap: r.x_umap,
    yUmap: r.y_umap,
  }));

  // 6. Build theme rows
  const themeRows: ThemeRow[] = themes.map((t) => ({
    clusterIndex: t.cluster_index,
    name: t.name,
    description: t.description,
    size: t.size,
  }));

  // 7. Aggregate feedback counts and current user's feedback per response
  const feedbackByResponse = new Map<
    string,
    { counts: FeedbackCounts; current: Feedback | null }
  >();

  // Initialize all responses with zero counts
  normalizedResponses.forEach((r) => {
    feedbackByResponse.set(r.id, {
      counts: { agree: 0, pass: 0, disagree: 0 },
      current: null,
    });
  });

  // Aggregate feedback
  feedbackRows.forEach((fb) => {
    const existing = feedbackByResponse.get(String(fb.response_id));
    if (!existing) return;

    const feedbackType = fb.feedback as Feedback;

    // Increment count
    if (feedbackType === "agree" || feedbackType === "pass" || feedbackType === "disagree") {
      existing.counts[feedbackType]++;
    }

    // Track current user's feedback
    if (fb.user_id === userId) {
      existing.current = feedbackType;
    }
  });

  // 8. Build feedback items
  const feedbackItems: FeedbackItem[] = normalizedResponses.map((r) => {
    const fb = feedbackByResponse.get(r.id)!;
    return {
      id: r.id,
      responseText: r.response_text,
      tag: r.tag,
      clusterIndex: r.cluster_index,
      counts: fb.counts,
      current: fb.current,
    };
  });

  // 9. Build frequently mentioned groups
  const frequentlyMentionedGroups: FrequentlyMentionedGroup[] = groupsData.map((group) => {
    const representativeId = String(group.representative_response_id);
    const representative = normalizedResponses.find((r) => r.id === representativeId);
    const representativeFeedback = feedbackByResponse.get(representativeId);

    // Extract member IDs from join table results
    const memberIds: string[] = (group.conversation_response_group_members || []).map((m) =>
      String(m.response_id)
    );

    // Get similar responses (exclude representative from display)
    const similarResponses = memberIds
      .filter((id) => id !== representativeId)
      .map((id) => {
        const resp = normalizedResponses.find((r) => r.id === id);
        return resp
          ? {
              id: resp.id,
              responseText: resp.response_text,
              tag: resp.tag,
            }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return {
      groupId: String(group.id),
      clusterIndex: group.cluster_index,
      representative: {
        id: representativeId,
        responseText: representative?.response_text || "",
        tag: representative?.tag || null,
        counts: representativeFeedback?.counts || { agree: 0, pass: 0, disagree: 0 },
        current: representativeFeedback?.current || null,
      },
      similarResponses,
      size: group.group_size,
      params: normalizeGroupingParams(group.params),
    };
  });

  // 10. Return complete view model with staleness metadata
  return {
    conversationId,
    responses: responsePoints,
    themes: themeRows,
    feedbackItems,
    frequentlyMentionedGroups,
    analysisStatus: parseAnalysisStatus(conversation.analysis_status),
    analysisError: conversation.analysis_error,
    responseCount,
    threshold: UNDERSTAND_MIN_RESPONSES,
    analysisResponseCount,
    analysisUpdatedAt: conversation.analysis_updated_at,
    newResponsesSinceAnalysis,
    isAnalysisStale,
  };
}
