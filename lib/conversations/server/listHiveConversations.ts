/**
 * List Hive Conversations - Server-Side Data Access
 *
 * Fetches conversations for a hive with security checks
 * Follows SOLID principles:
 * - SRP: Single responsibility of fetching conversation data
 * - Security: Verifies user membership before returning data
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationCardData } from "@/types/conversations";
import { checkHiveMembership } from "@/lib/navbar/data/hiveRepository";

/**
 * Fetch conversations for a hive
 *
 * Security:
 * - Verifies user is a member of the hive
 * - Only returns minimal data needed for cards
 *
 * @param supabase - Supabase client
 * @param hiveId - Hive UUID
 * @param userId - User UUID
 * @returns Array of conversation card data
 * @throws Error if user is not a member or query fails
 */
export async function listHiveConversations(
  supabase: SupabaseClient,
  hiveId: string,
  userId: string
): Promise<ConversationCardData[]> {
  // 1. Security: Verify membership
  const isMember = await checkHiveMembership(supabase, userId, hiveId);
  if (!isMember) {
    throw new Error("Unauthorized: User is not a member of this hive");
  }

  // 2. Fetch conversations (minimal data for cards)
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, slug, type, title, description, created_at, analysis_status, report_json")
    .eq("hive_id", hiveId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch conversations: ${error.message}`);
  }

  // 3. Type-safe return
  return (conversations ?? []) as ConversationCardData[];
}
