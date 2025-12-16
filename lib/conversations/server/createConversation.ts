/**
 * Create Conversation Service
 *
 * Server-side business logic for creating conversations
 * Follows SRP: single responsibility of conversation creation
 * Dependency injection for testability
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationType } from "@/types/conversations";
import { requireHiveMember } from "./requireHiveMember";

export interface CreateConversationParams {
  hiveId: string;
  type: ConversationType;
  title: string;
  description?: string;
}

export interface CreateConversationResult {
  id: string;
  slug: string | null;
}

/**
 * Create a new conversation
 *
 * @param supabase - Supabase client with auth
 * @param userId - ID of user creating the conversation
 * @param params - Conversation creation parameters
 * @returns Created conversation ID and slug
 * @throws Error if user is not authorized or creation fails
 */
export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  params: CreateConversationParams
): Promise<CreateConversationResult> {
  const { hiveId, type, title, description } = params;

  // Authorization: verify user is a member of the hive
  await requireHiveMember(supabase, userId, hiveId);

  // Create conversation with initial state
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      hive_id: hiveId,
      type,
      title,
      description: description || null,
      phase: "listen_open",
      analysis_status: "not_started",
      created_by: userId,
    })
    .select("id, slug")
    .single();

  if (error) {
    console.error("[createConversation] Insert failed:", error);
    throw new Error("Failed to create conversation");
  }

  if (!data) {
    throw new Error("Failed to create conversation: no data returned");
  }

  return {
    id: data.id,
    slug: data.slug,
  };
}
