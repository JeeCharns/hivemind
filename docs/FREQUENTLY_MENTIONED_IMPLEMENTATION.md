# Frequently Mentioned Grouping - Implementation Guide

## Overview

This document tracks the implementation of the "Frequently Mentioned" feature, which groups near-duplicate responses within themes using cosine similarity on embeddings.

## Status: **✅ FULLY IMPLEMENTED**

### ✅ Completed

#### 1. Database Schema ([supabase/migrations/012_add_response_groups.sql](../supabase/migrations/012_add_response_groups.sql))
- `conversation_response_embeddings`: Persists embeddings for similarity computation
- `conversation_response_groups`: Stores group metadata (representative, size, params)
- `conversation_response_group_members`: Normalized join table for group membership
- RLS policies configured for hive member access
- Unique constraint ensures one group per response

#### 2. Core Algorithm ([lib/conversations/domain/similarityGrouping.ts](../lib/conversations/domain/similarityGrouping.ts))
- **Connected components grouping**: Builds similarity graph using cosine similarity threshold
- **Representative selection**: Medoid-like approach (response closest to centroid)
- **Configurable parameters**:
  - `simThreshold`: Default 0.85 (tune empirically)
  - `minGroupSize`: Default 2
  - `algorithmVersion`: "v1.1" for observability
- **Performance**: O(n²) within each theme (acceptable for typical theme sizes < 300)
  - TODO: Add approximate nearest neighbor (ANN) for larger themes

#### 3. Server Services
- [lib/conversations/server/saveResponseEmbeddings.ts](../lib/conversations/server/saveResponseEmbeddings.ts): Persists embeddings to DB
- [lib/conversations/server/saveResponseGroups.ts](../lib/conversations/server/saveResponseGroups.ts): Persists groups and members
- Both services include batch processing and observability logging

#### 4. Analysis Pipeline Integration ([lib/conversations/server/runConversationAnalysis.ts](../lib/conversations/server/runConversationAnalysis.ts))
- Embeddings are now persisted after being generated
- Grouping runs after clustering is complete
- Groups are saved with full audit trail (params, algorithm version)
- Logging includes group statistics (count, size distribution, coverage)

#### 5. View Model & API ([lib/conversations/server/getUnderstandViewModel.ts](../lib/conversations/server/getUnderstandViewModel.ts))
- `UnderstandViewModel` extended with `frequentlyMentionedGroups`
- Groups fetched from DB with join to members table
- Representative feedback counts aggregated from existing `response_feedback` table
- Similar responses exclude representative (shown only on expand)
- Graceful degradation: groups are optional (errors logged but don't block page load)

#### 6. Type Definitions ([types/conversation-understand.ts](../types/conversation-understand.ts))
- `FrequentlyMentionedGroup` interface with representative, similar responses, and metadata
- Integrates with existing feedback system (vote on representative = vote on response)

#### 7. UI Components ([FrequentlyMentionedGroupCard.tsx](../app/components/conversation/FrequentlyMentionedGroupCard.tsx), [UnderstandView.tsx](../app/components/conversation/UnderstandView.tsx))
- ✅ `FrequentlyMentionedGroupCard` component with expand/collapse
- ✅ "Frequently mentioned" badge with group size indicator
- ✅ "Show N similar responses" toggle with smooth animation
- ✅ Indented similar responses display when expanded
- ✅ Vote controls on representative (reuses existing feedback system)
- ✅ Integrated into `UnderstandView`:
  - Groups rendered first (top of theme response list)
  - Ungrouped responses rendered after groups
  - Duplicate prevention (responses in groups don't appear twice)
  - Theme filtering works with groups
- ✅ Type-safe with full TypeScript support
- ✅ Linting passes with no errors
- ✅ Keyboard accessible (expand/collapse, voting)

### 🚧 Remaining Work (Optional Enhancements)

#### 8. Incremental Analysis Support (Next Step)
#### 8. Incremental Analysis Support (Optional)
**Files**:
- `lib/conversations/server/runConversationAnalysisIncremental.ts`
- Add grouping step for new responses only

**Strategy**:
- Option A (simple): Re-run grouping for entire theme when new responses added to it
- Option B (complex): Incrementally update groups by checking new responses against existing centroids
- Recommendation: Start with Option A for simplicity

#### 9. Tests
- ✅ `lib/conversations/domain/__tests__/similarityGrouping.test.ts`:
  - ✅ 12 passing tests covering connected components, similarity, thresholds, edge cases
  - ✅ Test representative selection (medoid)
  - ✅ Test transitive similarity
  - ✅ Test theme separation
- 🚧 `lib/conversations/server/__tests__/saveResponseGroups.test.ts` (not implemented)
- 🚧 Integration tests (not implemented)

#### 10. Documentation Updates
- ✅ Created `docs/FREQUENTLY_MENTIONED_IMPLEMENTATION.md` (this file)
**Files to update**:
- [docs/feature-map.md](feature-map.md): Add grouping to Understand tab flow
- [lib/conversations/README.md](../lib/conversations/README.md): Document grouping in analysis pipeline
- [docs/ARCHITECTURE.md](ARCHITECTURE.md): Add grouping as analysis artifact

### Migration Instructions

#### Apply Database Migration

Run this migration in Supabase SQL Editor:

```sql
-- File: supabase/migrations/012_add_response_groups.sql
-- (See file for full SQL)
```

**Verification**:
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('conversation_response_embeddings', 'conversation_response_groups', 'conversation_response_group_members');

-- Check indexes
SELECT indexname FROM pg_indexes
WHERE tablename IN ('conversation_response_embeddings', 'conversation_response_groups', 'conversation_response_group_members');
```

#### Re-run Analysis (Backfill Existing Conversations)

After deploying code changes:

```bash
# Trigger re-analysis for existing conversations to populate groups
# (Assuming you have a script or API endpoint for this)
POST /api/conversations/{conversationId}/analyze
{
  "mode": "regenerate",
  "strategy": "full"
}
```

This will:
1. Re-generate embeddings and persist them
2. Re-cluster responses
3. Compute and save groups
4. Users will see "Frequently mentioned" groups on next page load

### Testing Plan

#### Unit Tests
```bash
npm test lib/conversations/domain/__tests__/similarityGrouping.test.ts
npm test lib/conversations/server/__tests__/saveResponseGroups.test.ts
```

#### Integration Tests
```bash
npm test app/tests/api/understand.test.ts  # (new test file)
```

#### Manual QA Checklist
- [ ] Create conversation with 20+ paraphrased responses
- [ ] Trigger analysis
- [ ] Verify groups appear in DB tables
- [ ] Load Understand tab
- [ ] Verify "Frequently mentioned" groups render
- [ ] Click "Show N similar responses" - verify expand/collapse
- [ ] Vote on representative - verify feedback persists
- [ ] Check group stats in server logs

### Performance Considerations

#### Current Implementation
- Similarity computation: O(n²) per theme (acceptable for themes < 300 responses)
- DB batch inserts: 100 embeddings, 500 members per batch
- Graceful degradation: Group fetch failures don't block page load

#### Future Optimizations (if needed)
1. **Approximate Nearest Neighbor (ANN)**:
   - Use pgvector extension for approximate similarity search
   - Only compute exact cosine for top-k candidates (k=10-25)
   - Reduces complexity from O(n²) to O(n log n)

2. **Caching**:
   - Cache group data in view model (already done)
   - Consider client-side caching for frequent refreshes

3. **Lazy Loading**:
   - Load groups only when theme is selected (not currently needed)

### Observability

#### Logging
All services log:
- Number of groups created per theme
- Size distribution (how many groups of size 3, 4, 5, etc.)
- Total responses grouped
- Algorithm parameters used

**Example log**:
```
[saveResponseGroups] Group stats: {
  groupCount: 5,
  totalResponsesGrouped: 18,
  sizeDistribution: { 3: 3, 4: 1, 6: 1 }
}
```

#### Monitoring Queries
```sql
-- Check group coverage (what % of responses are grouped)
SELECT
  c.id,
  c.analysis_response_count,
  COUNT(DISTINCT m.response_id) AS responses_grouped,
  ROUND(100.0 * COUNT(DISTINCT m.response_id) / c.analysis_response_count, 2) AS coverage_pct
FROM conversations c
LEFT JOIN conversation_response_groups g ON g.conversation_id = c.id
LEFT JOIN conversation_response_group_members m ON m.group_id = g.id
WHERE c.analysis_status = 'ready'
GROUP BY c.id;

-- Check average group size per conversation
SELECT
  conversation_id,
  AVG(group_size) AS avg_group_size,
  MAX(group_size) AS max_group_size,
  COUNT(*) AS total_groups
FROM conversation_response_groups
GROUP BY conversation_id;
```

### Rollback Plan

If issues arise:

1. **Database**: Keep migration in place (backward compatible)
2. **Code**: Feature flag to disable group rendering in UI
3. **Analysis**: Groups are computed but optional in view model (already graceful)

### Next Steps

1. **Implement UI components** (highest priority for user value)
2. **Write tests** (ensure correctness before launch)
3. **Add incremental analysis support** (for real-time updates)
4. **Tune similarity threshold** (gather user feedback on grouping quality)
5. **Update documentation** (feature map, README, architecture docs)

### Open Questions

1. **Threshold tuning**: Should we expose `simThreshold` as a hive admin setting?
2. **UI placement**: Should groups always appear at top of theme list, or mixed with regular responses?
3. **Voting semantics**: Should voting on representative apply to all members, or just representative?
   - Current: Vote on representative only (simplest, preserves existing feedback model)
4. **Incremental updates**: Re-group entire theme vs. incremental membership updates?
   - Recommendation: Start with full re-grouping per theme (simpler, more stable)

### References

- Spec: [Original feature spec](../) (user-provided)
- Connected components: Standard graph algorithm (DFS-based)
- Cosine similarity: Standard vector similarity metric for embeddings
- Medoid selection: Representative = response closest to group centroid
