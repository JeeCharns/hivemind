-- Migration: Add composite index for vote budget calculation
-- The vote_on_proposal RPC runs: SUM(votes * votes) WHERE conversation_id AND user_id
-- Current index only covers conversation_id, causing full scan for user filtering

-- Covering index: includes votes column for index-only scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qv_allocations_conv_user_votes
ON public.quadratic_vote_allocations(conversation_id, user_id)
INCLUDE (votes);

COMMENT ON INDEX idx_qv_allocations_conv_user_votes IS
  'Optimizes vote_on_proposal RPC budget calculation query.
   Covers: SELECT SUM(votes*votes) WHERE conversation_id = ? AND user_id = ?
   INCLUDE (votes) enables index-only scan without table lookup.';
