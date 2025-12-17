/**
 * Get Vote View Model
 *
 * Server-side helper to build the complete view model for the Vote tab
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserVotes } from "./getUserVotes";
import type { Proposal } from "@/app/components/conversation/VoteView";

export interface VoteViewModel {
  proposals: Proposal[];
  totalCreditsSpent: number;
  remainingCredits: number;
}

/**
 * Build view model for Vote tab
 *
 * @param supabase - Supabase client with auth
 * @param conversationId - Conversation ID
 * @param userId - User ID
 * @returns Complete vote view model
 */
export async function getVoteViewModel(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<VoteViewModel> {
  // Fetch all proposals (responses with tag "proposal")
  const { data: responses, error: responsesError } = await supabase
    .from("conversation_responses")
    .select(
      "id, response_text, created_at, user_id, is_anonymous, profiles:user_id(display_name, avatar_path)"
    )
    .eq("conversation_id", conversationId)
    .eq("tag", "proposal")
    .order("created_at", { ascending: false });

  if (responsesError) {
    console.error("[getVoteViewModel] Failed to fetch proposals:", responsesError);
    throw new Error("Failed to fetch proposals");
  }

  // Fetch user's votes
  const voteSummary = await getUserVotes(supabase, conversationId, userId);

  // Build proposal view models
  const proposals: Proposal[] = (responses || []).map((r) => {
    const profile = r.profiles as
      | { display_name?: string | null; avatar_path?: string | null }
      | null
      | undefined;
    const isAnonymous = r.is_anonymous ?? false;

    return {
      id: r.id,
      text: r.response_text,
      author: {
        name: isAnonymous ? "Anonymous" : (profile?.display_name || "Member"),
        avatarUrl: isAnonymous ? null : (profile?.avatar_path || null),
      },
      createdAt: r.created_at,
      currentVotes: voteSummary.votes[r.id] || 0,
    };
  });

  return {
    proposals,
    totalCreditsSpent: voteSummary.totalCreditsSpent,
    remainingCredits: voteSummary.remainingCredits,
  };
}
