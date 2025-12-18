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
  sourceConversationId?: string;
  sourceReportVersion?: number;
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
  const {
    hiveId,
    type,
    title,
    description,
    sourceConversationId,
    sourceReportVersion,
  } = params;

  // Authorization: verify user is a member of the hive
  await requireHiveMember(supabase, userId, hiveId);

  // Additional validation for decision sessions with source reports
  if (type === "decide" && sourceConversationId) {
    // Verify source conversation exists, is in same hive, and is type "understand"
    const { data: sourceConv, error: sourceError } = await supabase
      .from("conversations")
      .select("id, hive_id, type")
      .eq("id", sourceConversationId)
      .maybeSingle();

    if (sourceError || !sourceConv) {
      throw new Error("Source conversation not found");
    }

    if (sourceConv.hive_id !== hiveId) {
      throw new Error("Source conversation must be in the same hive");
    }

    if (sourceConv.type !== "understand") {
      throw new Error('Source conversation must be type "understand"');
    }

    // If specific version requested, verify it exists
    if (sourceReportVersion !== undefined) {
      const { data: report, error: reportError } = await supabase
        .from("conversation_reports")
        .select("version")
        .eq("conversation_id", sourceConversationId)
        .eq("version", sourceReportVersion)
        .maybeSingle();

      if (reportError || !report) {
        throw new Error(
          `Report version ${sourceReportVersion} not found for source conversation`
        );
      }
    }
  }

  // Create conversation with initial state
  const insertData: Record<string, unknown> = {
    hive_id: hiveId,
    type,
    title,
    description: description || null,
    phase: "listen_open",
    analysis_status: "not_started",
    created_by: userId,
  };

  // Add source fields if provided (decision sessions only)
  if (type === "decide" && sourceConversationId) {
    insertData.source_conversation_id = sourceConversationId;
    if (sourceReportVersion !== undefined) {
      insertData.source_report_version = sourceReportVersion;
    }
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert(insertData)
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
