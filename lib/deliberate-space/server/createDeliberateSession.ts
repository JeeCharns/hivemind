/**
 * Create Deliberate Session Service
 *
 * Server-side business logic for creating deliberate sessions.
 * Deliberate sessions allow 5-point sentiment voting on statements.
 * Supports two modes:
 * - from-understand: Import statements from an existing understand/explore session
 * - from-scratch: Manually create statements
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateDeliberateSessionInput } from "@/lib/deliberate-space/schemas";

export interface CreateDeliberateSessionResult {
  conversationId: string;
  slug: string | null;
}

/**
 * Create a new deliberate session with statements
 *
 * @param supabase - Supabase client with auth
 * @param userId - ID of user creating the session
 * @param input - Session creation parameters (validated by Zod schema)
 * @returns Created conversation ID and slug
 * @throws Error if user is not authorised or creation fails
 */
export async function createDeliberateSession(
  supabase: SupabaseClient,
  userId: string,
  input: CreateDeliberateSessionInput
): Promise<CreateDeliberateSessionResult> {
  const { hiveId, mode, title, description } = input;

  // 1. Verify user is hive member
  const { data: membership, error: memberError } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", hiveId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError || !membership) {
    throw new Error("User is not a member of this hive");
  }

  // 2. If from-understand, verify source conversation
  if (mode === "from-understand" && input.sourceConversationId) {
    const { data: sourceConv, error: sourceError } = await supabase
      .from("conversations")
      .select("id, hive_id, type, analysis_status")
      .eq("id", input.sourceConversationId)
      .maybeSingle();

    if (sourceError || !sourceConv) {
      throw new Error("Source conversation not found");
    }

    if (sourceConv.hive_id !== hiveId) {
      throw new Error("Source conversation must be in the same hive");
    }

    if (sourceConv.type !== "understand" && sourceConv.type !== "explore") {
      throw new Error("Source must be an understand or explore session");
    }

    if (sourceConv.analysis_status !== "ready") {
      throw new Error("Source analysis must be complete");
    }
  }

  // 3. Create the conversation
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      hive_id: hiveId,
      type: "deliberate",
      title,
      description: description || null,
      phase: "listen_open",
      analysis_status: "ready",
      created_by: userId,
      source_conversation_id:
        mode === "from-understand" ? input.sourceConversationId : null,
    })
    .select("id, slug")
    .single();

  if (convError || !conversation) {
    console.error(
      "[createDeliberateSession] Failed to create conversation:",
      convError
    );
    throw new Error("Failed to create deliberate session");
  }

  // 4. Create statements
  const statements =
    mode === "from-understand" && input.selectedStatements
      ? input.selectedStatements.map((stmt, index) => ({
          conversation_id: conversation.id,
          cluster_index: stmt.clusterIndex,
          cluster_name: stmt.clusterName,
          statement_text: stmt.statementText,
          source_bucket_id: stmt.bucketId,
          display_order: index,
        }))
      : (input.manualStatements || []).map((stmt, index) => ({
          conversation_id: conversation.id,
          cluster_index: null,
          cluster_name: stmt.clusterName || null,
          statement_text: stmt.text,
          source_bucket_id: null,
          display_order: index,
        }));

  const { error: statementsError } = await supabase
    .from("deliberation_statements")
    .insert(statements);

  if (statementsError) {
    console.error(
      "[createDeliberateSession] Failed to create statements:",
      statementsError
    );
    // Rollback: delete the conversation we just created
    await supabase.from("conversations").delete().eq("id", conversation.id);
    throw new Error("Failed to create statements");
  }

  return {
    conversationId: conversation.id,
    slug: conversation.slug,
  };
}
