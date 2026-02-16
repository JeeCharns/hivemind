/**
 * Resolve Hive and Conversation - Server-Side Resolution
 *
 * Resolves hive and conversation keys (slug or UUID) to full records
 * Follows SRP: single responsibility of resolution
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";

interface HiveRecord {
  id: string;
  slug: string | null;
  name: string;
}

interface ConversationRecord {
  id: string;
  slug: string | null;
  hive_id: string;
  title: string | null;
  description: string | null;
  type: string;
  phase: string;
  analysis_status: string | null;
  report_json: unknown | null;
  source_conversation_id: string | null;
  source_report_version: number | null;
}

interface ResolvedHiveAndConversation {
  hive: HiveRecord;
  conversation: ConversationRecord;
}

/**
 * Resolve both hive and conversation from keys
 *
 * @param supabase - Supabase client
 * @param hiveKey - Hive slug or ID
 * @param conversationKey - Conversation slug or ID
 * @returns Resolved hive and conversation records
 * @throws Error if either not found
 */
export async function resolveHiveAndConversation(
  supabase: SupabaseClient,
  hiveKey: string,
  conversationKey: string
): Promise<ResolvedHiveAndConversation> {
  // 1. Resolve hive
  const hiveId = await resolveHiveId(supabase, hiveKey);
  if (!hiveId) {
    throw new Error(`Hive not found: ${hiveKey}`);
  }

  const { data: hive, error: hiveError } = await supabase
    .from("hives")
    .select("id, slug, name")
    .eq("id", hiveId)
    .maybeSingle();

  if (hiveError || !hive) {
    throw new Error(`Failed to fetch hive: ${hiveError?.message || "Not found"}`);
  }

  // 2. Resolve conversation (slug or ID)
  const conversationId = await resolveConversationId(
    supabase,
    hiveId,
    conversationKey
  );

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, slug, hive_id, title, description, type, phase, analysis_status, report_json, source_conversation_id, source_report_version")
    .eq("id", conversationId)
    .eq("hive_id", hiveId)
    .maybeSingle();

  if (conversationError || !conversation) {
    throw new Error(
      `Failed to fetch conversation: ${conversationError?.message || "Not found"}`
    );
  }

  return {
    hive: hive as HiveRecord,
    conversation: conversation as ConversationRecord,
  };
}

/**
 * Resolve conversation key (slug or UUID) to conversation ID
 *
 * @param supabase - Supabase client
 * @param hiveId - Hive UUID
 * @param conversationKey - Conversation slug or ID
 * @returns Conversation ID
 * @throws Error if not found
 */
async function resolveConversationId(
  supabase: SupabaseClient,
  hiveId: string,
  conversationKey: string
): Promise<string> {
  // Check if it's already a valid UUID
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidPattern.test(conversationKey)) {
    // Verify it exists and belongs to this hive
    const { data, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationKey)
      .eq("hive_id", hiveId)
      .maybeSingle();

    if (error) {
      throw new Error(`Error resolving conversation UUID: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Conversation not found: ${conversationKey}`);
    }

    return data.id;
  }

  // It's likely a slug, look it up
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("slug", conversationKey)
    .eq("hive_id", hiveId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error resolving conversation slug: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Conversation not found: ${conversationKey}`);
  }

  return data.id;
}
