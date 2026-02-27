/**
 * Get Deliberate View Model Service
 *
 * Builds the view model for the discuss tab of deliberate sessions.
 * Fetches statements, aggregates votes, counts comments, and gets user's votes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeliberateViewModel,
  DeliberateStatement,
  DeliberateCluster,
  VoteValue,
} from "@/types/deliberate-space";

interface GetDeliberateViewModelParams {
  conversationId: string;
  userId?: string;
  guestSessionId?: string;
}

/**
 * Get the view model for a deliberate session
 *
 * @param supabase - Supabase client with auth
 * @param params - Conversation ID and optional user/guest identifiers
 * @returns View model with statements, votes, and clusters or null if not found
 */
export async function getDeliberateViewModel(
  supabase: SupabaseClient,
  params: GetDeliberateViewModelParams
): Promise<DeliberateViewModel | null> {
  const { conversationId, userId, guestSessionId } = params;

  // 1. Get conversation
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, slug, type, hive_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation || conversation.type !== "deliberate") {
    return null;
  }

  // 2. Get hive slug
  const { data: hiveData } = await supabase
    .from("hives")
    .select("slug")
    .eq("id", conversation.hive_id)
    .single();

  const hiveKey = hiveData?.slug ?? conversation.hive_id;

  // 3. Get statements
  const { data: statements, error: stmtError } = await supabase
    .from("deliberation_statements")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("display_order", { ascending: true });

  if (stmtError || !statements?.length) {
    // Return empty view model if no statements
    return {
      conversationId,
      hiveKey,
      conversationKey: conversation.slug || conversationId,
      statements: [],
      userVotes: {},
      clusters: [],
    };
  }

  const statementIds = statements.map((s) => s.id);

  // 4. Get vote aggregates
  const { data: allVotes } = await supabase
    .from("deliberation_votes")
    .select("statement_id, vote_value")
    .in("statement_id", statementIds);

  const votesByStatement = new Map<string, { count: number; sum: number }>();
  for (const vote of allVotes || []) {
    const existing = votesByStatement.get(vote.statement_id) || {
      count: 0,
      sum: 0,
    };
    existing.count++;
    existing.sum += vote.vote_value;
    votesByStatement.set(vote.statement_id, existing);
  }

  // 5. Get comment counts
  const { data: comments } = await supabase
    .from("deliberation_comments")
    .select("statement_id")
    .in("statement_id", statementIds);

  const commentsByStatement = new Map<string, number>();
  for (const comment of comments || []) {
    const count = commentsByStatement.get(comment.statement_id) || 0;
    commentsByStatement.set(comment.statement_id, count + 1);
  }

  // 6. Get user's votes
  let userVotesQuery = supabase
    .from("deliberation_votes")
    .select("statement_id, vote_value")
    .in("statement_id", statementIds);

  if (userId) {
    userVotesQuery = userVotesQuery.eq("user_id", userId);
  } else if (guestSessionId) {
    userVotesQuery = userVotesQuery.eq("guest_session_id", guestSessionId);
  } else {
    // No user or guest - return empty votes by querying for impossible ID
    userVotesQuery = userVotesQuery.eq(
      "user_id",
      "00000000-0000-0000-0000-000000000000"
    );
  }

  const { data: userVotes } = await userVotesQuery;

  const userVotesMap: Record<string, VoteValue | null> = {};
  for (const vote of userVotes || []) {
    userVotesMap[vote.statement_id] = vote.vote_value as VoteValue;
  }

  // 7. Build statement list
  const statementList: DeliberateStatement[] = statements.map((stmt) => {
    const votes = votesByStatement.get(stmt.id);
    return {
      id: stmt.id,
      clusterIndex: stmt.cluster_index,
      clusterName: stmt.cluster_name,
      statementText: stmt.statement_text,
      sourceBucketId: stmt.source_bucket_id,
      displayOrder: stmt.display_order,
      voteCount: votes?.count || 0,
      averageVote: votes ? votes.sum / votes.count : null,
      commentCount: commentsByStatement.get(stmt.id) || 0,
    };
  });

  // 8. Build cluster list
  const clusterMap = new Map<number | null, DeliberateCluster>();
  for (const stmt of statementList) {
    const key = stmt.clusterIndex;
    const existing = clusterMap.get(key);
    if (existing) {
      existing.statementCount++;
    } else {
      clusterMap.set(key, {
        index: key,
        name: stmt.clusterName,
        statementCount: 1,
      });
    }
  }

  return {
    conversationId,
    hiveKey,
    conversationKey: conversation.slug || conversationId,
    statements: statementList,
    userVotes: userVotesMap,
    clusters: Array.from(clusterMap.values()).sort((a, b) => {
      if (a.index === null) return 1;
      if (b.index === null) return -1;
      return a.index - b.index;
    }),
  };
}
