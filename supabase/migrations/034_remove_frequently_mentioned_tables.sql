-- Migration: 034_remove_frequently_mentioned_tables
-- Purpose: Remove the "frequently mentioned" feature tables
--
-- This feature has been superseded by cluster buckets (LLM-driven consolidation).
-- The tables being dropped are:
-- - conversation_consolidated_statements (group-based consolidated statements)
-- - conversation_response_group_members (membership mapping)
-- - conversation_response_groups (frequently mentioned groups)
--
-- Note: conversation_response_embeddings is intentionally kept for potential future use.

-- Drop tables in correct order (respecting foreign key constraints)
-- conversation_consolidated_statements has FK to conversation_response_groups
DROP TABLE IF EXISTS conversation_consolidated_statements CASCADE;

-- conversation_response_group_members has FK to conversation_response_groups
DROP TABLE IF EXISTS conversation_response_group_members CASCADE;

-- Main groups table
DROP TABLE IF EXISTS conversation_response_groups CASCADE;
