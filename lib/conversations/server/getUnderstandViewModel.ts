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
} from "@/types/conversation-understand";
import { requireHiveMember } from "./requireHiveMember";

interface ResponseRow {
  id: string;
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
  response_id: string;
  feedback: string;
  user_id: string;
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
  // 1. Verify conversation exists and get hive_id
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, hive_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found");
  }

  // 2. Verify user is a member of the hive
  await requireHiveMember(supabase, userId, conversation.hive_id);

  // 3. Fetch all data in parallel
  const [responsesResult, themesResult, feedbackResult] = await Promise.all([
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

  const responses = (responsesResult.data || []) as ResponseRow[];
  const themes = (themesResult.data || []) as ThemeDbRow[];
  const feedbackRows = (feedbackResult.data || []) as FeedbackRow[];

  // 4. Build response points
  const responsePoints: ResponsePoint[] = responses.map((r) => ({
    id: r.id,
    responseText: r.response_text,
    tag: r.tag,
    clusterIndex: r.cluster_index,
    xUmap: r.x_umap,
    yUmap: r.y_umap,
  }));

  // 5. Build theme rows
  const themeRows: ThemeRow[] = themes.map((t) => ({
    clusterIndex: t.cluster_index,
    name: t.name,
    description: t.description,
    size: t.size,
  }));

  // 6. Aggregate feedback counts and current user's feedback per response
  const feedbackByResponse = new Map<
    string,
    { counts: FeedbackCounts; current: Feedback | null }
  >();

  // Initialize all responses with zero counts
  responses.forEach((r) => {
    feedbackByResponse.set(r.id, {
      counts: { agree: 0, pass: 0, disagree: 0 },
      current: null,
    });
  });

  // Aggregate feedback
  feedbackRows.forEach((fb) => {
    const existing = feedbackByResponse.get(fb.response_id);
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

  // 7. Build feedback items
  const feedbackItems: FeedbackItem[] = responses.map((r) => {
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

  // 8. Return complete view model
  return {
    conversationId,
    responses: responsePoints,
    themes: themeRows,
    feedbackItems,
  };
}
