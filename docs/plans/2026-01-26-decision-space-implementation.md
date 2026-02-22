# Decision Space Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable structured voting on statements from understand sessions, with versioned rounds and AI-generated result summaries.

**Architecture:** Multi-step wizard creates decision sessions by snapshotting statements from understand sessions. Quadratic voting with versioned rounds. Results generated via OpenAI after round closes.

**Tech Stack:** Next.js 16, Supabase (PostgreSQL + RLS), Zod validation, OpenAI for report generation

---

## Task 1: Database Migration - Core Tables

**Files:**

- Create: `supabase/migrations/024_decision_space_tables.sql`
- Modify: `supabase/README.md`

**Step 1: Write the migration**

```sql
-- Migration 024: Decision Space Tables
-- Enables versioned voting rounds on snapshotted statements from understand sessions

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE decision_round_status AS ENUM ('voting_open', 'voting_closed', 'results_generated');
CREATE TYPE decision_visibility AS ENUM ('hidden', 'aggregate', 'transparent');

-- ============================================
-- DECISION PROPOSALS (Snapshotted statements)
-- ============================================

CREATE TABLE IF NOT EXISTS decision_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_bucket_id UUID REFERENCES conversation_cluster_buckets(id) ON DELETE SET NULL,
  source_cluster_index INTEGER NOT NULL,
  statement_text TEXT NOT NULL,
  original_agree_percent DECIMAL(5,2),
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_proposal_order UNIQUE (conversation_id, display_order)
);

CREATE INDEX idx_decision_proposals_conversation
ON decision_proposals(conversation_id);

-- ============================================
-- DECISION ROUNDS (Versioned voting periods)
-- ============================================

CREATE TABLE IF NOT EXISTS decision_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1,
  status decision_round_status NOT NULL DEFAULT 'voting_open',
  visibility decision_visibility NOT NULL DEFAULT 'hidden',
  deadline TIMESTAMPTZ,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,

  CONSTRAINT unique_round_number UNIQUE (conversation_id, round_number),
  CONSTRAINT valid_round_number CHECK (round_number > 0)
);

CREATE INDEX idx_decision_rounds_conversation
ON decision_rounds(conversation_id);

CREATE INDEX idx_decision_rounds_status
ON decision_rounds(status) WHERE status = 'voting_open';

-- ============================================
-- DECISION VOTES (Per-round quadratic votes)
-- ============================================

CREATE TABLE IF NOT EXISTS decision_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES decision_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  proposal_id UUID NOT NULL REFERENCES decision_proposals(id) ON DELETE CASCADE,
  votes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_vote_per_user_proposal UNIQUE (round_id, user_id, proposal_id),
  CONSTRAINT non_negative_votes CHECK (votes >= 0)
);

CREATE INDEX idx_decision_votes_round
ON decision_votes(round_id);

CREATE INDEX idx_decision_votes_user_round
ON decision_votes(round_id, user_id);

-- ============================================
-- DECISION RESULTS (Generated per round)
-- ============================================

CREATE TABLE IF NOT EXISTS decision_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES decision_rounds(id) ON DELETE CASCADE,
  proposal_rankings JSONB NOT NULL DEFAULT '[]',
  ai_analysis TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_result_per_round UNIQUE (round_id)
);

-- ============================================
-- RPC: Vote on proposal with budget enforcement
-- ============================================

CREATE OR REPLACE FUNCTION vote_on_decision_proposal(
  p_round_id UUID,
  p_proposal_id UUID,
  p_user_id UUID,
  p_delta INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_id UUID;
  v_hive_id UUID;
  v_round_status decision_round_status;
  v_current_votes INTEGER;
  v_new_votes INTEGER;
  v_current_cost INTEGER;
  v_new_cost INTEGER;
  v_total_spent INTEGER;
  v_budget INTEGER := 99;
BEGIN
  -- Get round info
  SELECT dr.conversation_id, dr.status, c.hive_id
  INTO v_conversation_id, v_round_status, v_hive_id
  FROM decision_rounds dr
  JOIN conversations c ON c.id = dr.conversation_id
  WHERE dr.id = p_round_id;

  IF v_conversation_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ROUND_NOT_FOUND');
  END IF;

  -- Check round is open
  IF v_round_status != 'voting_open' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ROUND_CLOSED');
  END IF;

  -- Check hive membership
  IF NOT EXISTS (
    SELECT 1 FROM hive_members
    WHERE hive_id = v_hive_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_HIVE_MEMBER');
  END IF;

  -- Check proposal belongs to this conversation
  IF NOT EXISTS (
    SELECT 1 FROM decision_proposals
    WHERE id = p_proposal_id AND conversation_id = v_conversation_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PROPOSAL');
  END IF;

  -- Get current votes for this proposal
  SELECT COALESCE(votes, 0) INTO v_current_votes
  FROM decision_votes
  WHERE round_id = p_round_id
    AND user_id = p_user_id
    AND proposal_id = p_proposal_id;

  IF v_current_votes IS NULL THEN
    v_current_votes := 0;
  END IF;

  v_new_votes := v_current_votes + p_delta;

  -- Check no negative votes
  IF v_new_votes < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NEGATIVE_VOTES');
  END IF;

  -- Calculate costs (quadratic)
  v_current_cost := v_current_votes * v_current_votes;
  v_new_cost := v_new_votes * v_new_votes;

  -- Calculate total spent (excluding this proposal)
  SELECT COALESCE(SUM(votes * votes), 0) INTO v_total_spent
  FROM decision_votes
  WHERE round_id = p_round_id
    AND user_id = p_user_id
    AND proposal_id != p_proposal_id;

  -- Check budget
  IF (v_total_spent + v_new_cost) > v_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BUDGET_EXCEEDED',
      'remaining_credits', v_budget - v_total_spent
    );
  END IF;

  -- Upsert vote
  INSERT INTO decision_votes (round_id, user_id, proposal_id, votes, updated_at)
  VALUES (p_round_id, p_user_id, p_proposal_id, v_new_votes, NOW())
  ON CONFLICT (round_id, user_id, proposal_id)
  DO UPDATE SET votes = v_new_votes, updated_at = NOW();

  -- Delete if zero votes
  IF v_new_votes = 0 THEN
    DELETE FROM decision_votes
    WHERE round_id = p_round_id
      AND user_id = p_user_id
      AND proposal_id = p_proposal_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'new_votes', v_new_votes,
    'remaining_credits', v_budget - v_total_spent - v_new_cost
  );
END;
$$;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE decision_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_results ENABLE ROW LEVEL SECURITY;

-- Proposals: viewable by hive members
CREATE POLICY "Hive members can view proposals"
ON decision_proposals FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = decision_proposals.conversation_id
      AND hm.user_id = auth.uid()
  )
);

-- Rounds: viewable by hive members
CREATE POLICY "Hive members can view rounds"
ON decision_rounds FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = decision_rounds.conversation_id
      AND hm.user_id = auth.uid()
  )
);

-- Votes: viewable based on round visibility
CREATE POLICY "Users can view own votes"
ON decision_votes FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Transparent rounds show all votes"
ON decision_votes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM decision_rounds dr
    JOIN conversations c ON c.id = dr.conversation_id
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE dr.id = decision_votes.round_id
      AND dr.visibility = 'transparent'
      AND hm.user_id = auth.uid()
  )
);

-- Results: viewable by hive members after generation
CREATE POLICY "Hive members can view results"
ON decision_results FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM decision_rounds dr
    JOIN conversations c ON c.id = dr.conversation_id
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE dr.id = decision_results.round_id
      AND hm.user_id = auth.uid()
  )
);

-- Service role policies for all tables
CREATE POLICY "Service role manages proposals"
ON decision_proposals FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages rounds"
ON decision_rounds FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages votes"
ON decision_votes FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages results"
ON decision_results FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
```

**Step 2: Update supabase/README.md**

Add to migration list:

```markdown
| 024 | Decision Space tables | Proposals, rounds, votes, results for decision sessions |
```

**Step 3: Run migration locally**

Run: `npx supabase db push` (or apply via Supabase dashboard)

**Step 4: Commit**

```bash
git add supabase/migrations/024_decision_space_tables.sql supabase/README.md
git commit -m "feat: add decision space database tables

Adds decision_proposals, decision_rounds, decision_votes, decision_results
tables with RLS policies and vote_on_decision_proposal RPC function."
```

---

## Task 2: TypeScript Types

**Files:**

- Create: `types/decision-space.ts`
- Modify: `types/index.ts` (if exists, add export)

**Step 1: Write the types**

```typescript
// types/decision-space.ts

/**
 * Decision Space Types
 *
 * Types for decision sessions with versioned voting rounds
 */

// ============================================
// ENUMS / UNIONS
// ============================================

export type DecisionRoundStatus =
  | "voting_open"
  | "voting_closed"
  | "results_generated";

export type DecisionVisibility = "hidden" | "aggregate" | "transparent";

// ============================================
// DATABASE ROWS
// ============================================

export interface DecisionProposalRow {
  id: string;
  conversation_id: string;
  source_bucket_id: string | null;
  source_cluster_index: number;
  statement_text: string;
  original_agree_percent: number | null;
  display_order: number;
  created_at: string;
}

export interface DecisionRoundRow {
  id: string;
  conversation_id: string;
  round_number: number;
  status: DecisionRoundStatus;
  visibility: DecisionVisibility;
  deadline: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface DecisionVoteRow {
  id: string;
  round_id: string;
  user_id: string;
  proposal_id: string;
  votes: number;
  created_at: string;
  updated_at: string;
}

export interface DecisionResultRow {
  id: string;
  round_id: string;
  proposal_rankings: ProposalRanking[];
  ai_analysis: string | null;
  generated_at: string;
}

// ============================================
// VIEW MODELS
// ============================================

export interface ProposalRanking {
  proposalId: string;
  statementText: string;
  totalVotes: number;
  votePercent: number;
  rank: number;
  changeFromPrevious?: number; // positive = moved up, negative = moved down
}

export interface DecisionProposalViewModel {
  id: string;
  statementText: string;
  sourceClusterIndex: number;
  originalAgreePercent: number | null;
  displayOrder: number;
  // Populated at runtime based on visibility
  totalVotes?: number;
  userVotes?: number;
}

export interface DecisionRoundViewModel {
  id: string;
  roundNumber: number;
  status: DecisionRoundStatus;
  visibility: DecisionVisibility;
  deadline: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface DecisionResultViewModel {
  roundId: string;
  roundNumber: number;
  proposalRankings: ProposalRanking[];
  aiAnalysis: string | null;
  generatedAt: string;
}

// ============================================
// API INPUTS
// ============================================

export interface CreateDecisionSessionInput {
  hiveId: string;
  sourceConversationId: string;
  title: string;
  description?: string;
  selectedClusters: number[];
  selectedStatements: SelectedStatement[];
  consensusThreshold: number; // 50-90
  visibility: DecisionVisibility;
  deadline?: string; // ISO date
}

export interface SelectedStatement {
  bucketId: string;
  clusterIndex: number;
  statementText: string;
  agreePercent: number | null;
}

export interface VoteOnProposalInput {
  roundId: string;
  proposalId: string;
  delta: number; // +1 or -1
}

export interface VoteOnProposalResult {
  success: boolean;
  newVotes?: number;
  remainingCredits?: number;
  errorCode?: string;
}

export interface CloseRoundInput {
  roundId: string;
}

export interface StartNewRoundInput {
  conversationId: string;
  keepProposals: boolean;
  // If keepProposals is false, these are required:
  selectedStatements?: SelectedStatement[];
}

// ============================================
// SETUP WIZARD STATE
// ============================================

export interface ClusterSelectionItem {
  clusterIndex: number;
  name: string;
  description: string;
  statementCount: number;
  avgConsensusPercent: number;
  selected: boolean;
}

export interface StatementSelectionItem {
  bucketId: string;
  clusterIndex: number;
  clusterName: string;
  statementText: string;
  agreePercent: number | null;
  totalVotes: number;
  selected: boolean;
  recommended: boolean; // above threshold
}

export interface DecisionSetupState {
  step: 1 | 2 | 3 | 4;
  sourceConversationId: string | null;
  selectedClusters: number[];
  selectedStatements: SelectedStatement[];
  consensusThreshold: number;
  title: string;
  description: string;
  visibility: DecisionVisibility;
  deadline: string | null;
}
```

**Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: No errors related to new types

**Step 3: Commit**

```bash
git add types/decision-space.ts
git commit -m "feat: add decision space TypeScript types"
```

---

## Task 3: Zod Validation Schemas

**Files:**

- Create: `lib/decision-space/schemas.ts`

**Step 1: Write the schemas**

```typescript
// lib/decision-space/schemas.ts

import { z } from "zod";

/**
 * Decision Space Validation Schemas
 */

// ============================================
// ENUMS
// ============================================

export const decisionVisibilitySchema = z.enum([
  "hidden",
  "aggregate",
  "transparent",
]);

// ============================================
// CREATE DECISION SESSION
// ============================================

export const selectedStatementSchema = z.object({
  bucketId: z.string().uuid(),
  clusterIndex: z.number().int().min(0),
  statementText: z.string().min(1).max(2000),
  agreePercent: z.number().min(0).max(100).nullable(),
});

export const createDecisionSessionSchema = z.object({
  hiveId: z.string().uuid(),
  sourceConversationId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  selectedClusters: z.array(z.number().int().min(0)).min(1),
  selectedStatements: z.array(selectedStatementSchema).min(1),
  consensusThreshold: z.number().int().min(50).max(90),
  visibility: decisionVisibilitySchema,
  deadline: z.string().datetime().optional(),
});

export type CreateDecisionSessionInput = z.infer<
  typeof createDecisionSessionSchema
>;

// ============================================
// VOTING
// ============================================

export const voteOnProposalSchema = z.object({
  roundId: z.string().uuid(),
  proposalId: z.string().uuid(),
  delta: z
    .number()
    .int()
    .refine((v) => v === 1 || v === -1, {
      message: "Delta must be 1 or -1",
    }),
});

export type VoteOnProposalInput = z.infer<typeof voteOnProposalSchema>;

// ============================================
// ROUND MANAGEMENT
// ============================================

export const closeRoundSchema = z.object({
  roundId: z.string().uuid(),
});

export type CloseRoundInput = z.infer<typeof closeRoundSchema>;

export const startNewRoundSchema = z
  .object({
    conversationId: z.string().uuid(),
    keepProposals: z.boolean(),
    selectedStatements: z.array(selectedStatementSchema).optional(),
  })
  .refine(
    (data) =>
      data.keepProposals ||
      (data.selectedStatements && data.selectedStatements.length > 0),
    { message: "selectedStatements required when keepProposals is false" }
  );

export type StartNewRoundInput = z.infer<typeof startNewRoundSchema>;

// ============================================
// FETCH PARAMS
// ============================================

export const getDecisionSetupDataSchema = z.object({
  sourceConversationId: z.string().uuid(),
});

export type GetDecisionSetupDataInput = z.infer<
  typeof getDecisionSetupDataSchema
>;
```

**Step 2: Verify schemas compile**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/decision-space/schemas.ts
git commit -m "feat: add decision space Zod validation schemas"
```

---

## Task 4: Service - Fetch Setup Data (Clusters & Statements)

**Files:**

- Create: `lib/decision-space/server/getDecisionSetupData.ts`

**Step 1: Write test file**

Create: `lib/decision-space/server/__tests__/getDecisionSetupData.test.ts`

```typescript
import { getDecisionSetupData } from "../getDecisionSetupData";

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
};

describe("getDecisionSetupData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns clusters and statements from completed understand session", async () => {
    // Mock conversation check
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "conversations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: "conv-123",
              hive_id: "hive-456",
              type: "understand",
              analysis_status: "ready",
            },
            error: null,
          }),
        };
      }
      if (table === "conversation_themes") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: [
              {
                cluster_index: 0,
                name: "Climate",
                description: "Climate topics",
                size: 10,
              },
              {
                cluster_index: 1,
                name: "Economy",
                description: "Economic topics",
                size: 8,
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "conversation_cluster_buckets") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: "bucket-1",
                cluster_index: 0,
                consolidated_statement: "Statement 1",
                response_count: 5,
              },
            ],
            error: null,
          }),
        };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    const result = await getDecisionSetupData(
      mockSupabase as any,
      "user-789",
      "conv-123"
    );

    expect(result.clusters).toHaveLength(2);
    expect(result.clusters[0].name).toBe("Climate");
  });

  it("throws error if conversation not found", async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });

    await expect(
      getDecisionSetupData(mockSupabase as any, "user-789", "invalid-id")
    ).rejects.toThrow("Source conversation not found");
  });

  it("throws error if analysis not complete", async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: "conv-123",
          type: "understand",
          analysis_status: "embedding",
        },
        error: null,
      }),
    });

    await expect(
      getDecisionSetupData(mockSupabase as any, "user-789", "conv-123")
    ).rejects.toThrow("Analysis must be complete");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/decision-space/server/__tests__/getDecisionSetupData.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the service**

```typescript
// lib/decision-space/server/getDecisionSetupData.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import type {
  ClusterSelectionItem,
  StatementSelectionItem,
} from "@/types/decision-space";

export interface GetDecisionSetupDataResult {
  sourceConversationId: string;
  sourceTitle: string;
  clusters: ClusterSelectionItem[];
  statements: StatementSelectionItem[];
}

/**
 * Fetch clusters and statements from a completed understand session
 * for use in decision space setup wizard
 */
export async function getDecisionSetupData(
  supabase: SupabaseClient,
  userId: string,
  sourceConversationId: string
): Promise<GetDecisionSetupDataResult> {
  // 1. Fetch and validate source conversation
  const { data: sourceConv, error: convError } = await supabase
    .from("conversations")
    .select("id, hive_id, type, title, analysis_status")
    .eq("id", sourceConversationId)
    .maybeSingle();

  if (convError || !sourceConv) {
    throw new Error("Source conversation not found");
  }

  if (sourceConv.type !== "understand") {
    throw new Error("Source must be an understand session");
  }

  if (sourceConv.analysis_status !== "ready") {
    throw new Error(
      "Analysis must be complete before creating decision session"
    );
  }

  // 2. Verify user has access to this hive
  await requireHiveMember(supabase, userId, sourceConv.hive_id);

  // 3. Fetch clusters (themes)
  const { data: themes, error: themesError } = await supabase
    .from("conversation_themes")
    .select("cluster_index, name, description, size")
    .eq("conversation_id", sourceConversationId)
    .order("cluster_index", { ascending: true });

  if (themesError) {
    throw new Error("Failed to fetch clusters");
  }

  // 4. Fetch consolidated statements (buckets) with consensus data
  const { data: buckets, error: bucketsError } = await supabase
    .from("conversation_cluster_buckets")
    .select(
      `
      id,
      cluster_index,
      bucket_name,
      consolidated_statement,
      response_count
    `
    )
    .eq("conversation_id", sourceConversationId)
    .order("cluster_index", { ascending: true })
    .order("bucket_index", { ascending: true });

  if (bucketsError) {
    throw new Error("Failed to fetch statements");
  }

  // 5. Fetch consensus data for buckets
  // Get the representative response for each bucket and its feedback
  const bucketIds = buckets?.map((b) => b.id) || [];

  let consensusMap: Map<string, { agreePercent: number; totalVotes: number }> =
    new Map();

  if (bucketIds.length > 0) {
    // Get first member response for each bucket
    const { data: members } = await supabase
      .from("conversation_cluster_bucket_members")
      .select("bucket_id, response_id")
      .in("bucket_id", bucketIds);

    if (members && members.length > 0) {
      // Get unique response IDs (first per bucket)
      const bucketToResponse = new Map<string, number>();
      for (const m of members) {
        if (!bucketToResponse.has(m.bucket_id)) {
          bucketToResponse.set(m.bucket_id, m.response_id);
        }
      }

      const responseIds = Array.from(bucketToResponse.values());

      // Fetch feedback for these responses
      const { data: feedback } = await supabase
        .from("conversation_feedback")
        .select("response_id, feedback")
        .eq("conversation_id", sourceConversationId)
        .in("response_id", responseIds);

      // Calculate consensus per bucket
      if (feedback) {
        const responseToFeedback = new Map<
          number,
          { agree: number; total: number }
        >();
        for (const f of feedback) {
          const existing = responseToFeedback.get(f.response_id) || {
            agree: 0,
            total: 0,
          };
          existing.total++;
          if (f.feedback === "agree") {
            existing.agree++;
          }
          responseToFeedback.set(f.response_id, existing);
        }

        for (const [bucketId, responseId] of bucketToResponse) {
          const stats = responseToFeedback.get(responseId);
          if (stats && stats.total > 0) {
            consensusMap.set(bucketId, {
              agreePercent: Math.round((stats.agree / stats.total) * 100),
              totalVotes: stats.total,
            });
          }
        }
      }
    }
  }

  // 6. Build cluster selection items with avg consensus
  const clusterConsensus = new Map<number, number[]>();
  for (const bucket of buckets || []) {
    const consensus = consensusMap.get(bucket.id);
    if (consensus) {
      const existing = clusterConsensus.get(bucket.cluster_index) || [];
      existing.push(consensus.agreePercent);
      clusterConsensus.set(bucket.cluster_index, existing);
    }
  }

  const clusters: ClusterSelectionItem[] = (themes || []).map((theme) => {
    const consensusValues = clusterConsensus.get(theme.cluster_index) || [];
    const avgConsensus =
      consensusValues.length > 0
        ? Math.round(
            consensusValues.reduce((a, b) => a + b, 0) / consensusValues.length
          )
        : 0;

    return {
      clusterIndex: theme.cluster_index,
      name: theme.name,
      description: theme.description || "",
      statementCount: (buckets || []).filter(
        (b) => b.cluster_index === theme.cluster_index
      ).length,
      avgConsensusPercent: avgConsensus,
      selected: false,
    };
  });

  // 7. Build statement selection items
  const clusterNames = new Map(
    themes?.map((t) => [t.cluster_index, t.name]) || []
  );

  const statements: StatementSelectionItem[] = (buckets || []).map((bucket) => {
    const consensus = consensusMap.get(bucket.id);
    return {
      bucketId: bucket.id,
      clusterIndex: bucket.cluster_index,
      clusterName:
        clusterNames.get(bucket.cluster_index) ||
        `Cluster ${bucket.cluster_index}`,
      statementText: bucket.consolidated_statement,
      agreePercent: consensus?.agreePercent ?? null,
      totalVotes: consensus?.totalVotes ?? 0,
      selected: false,
      recommended: false, // Will be set by UI based on threshold
    };
  });

  return {
    sourceConversationId,
    sourceTitle: sourceConv.title || "Untitled",
    clusters,
    statements,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/decision-space/server/__tests__/getDecisionSetupData.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/decision-space/server/getDecisionSetupData.ts lib/decision-space/server/__tests__/getDecisionSetupData.test.ts
git commit -m "feat: add getDecisionSetupData service

Fetches clusters and statements from completed understand sessions
for decision space setup wizard."
```

---

## Task 5: Service - Create Decision Session

**Files:**

- Create: `lib/decision-space/server/createDecisionSession.ts`
- Create: `lib/decision-space/server/__tests__/createDecisionSession.test.ts`

**Step 1: Write the test**

```typescript
// lib/decision-space/server/__tests__/createDecisionSession.test.ts

import { createDecisionSession } from "../createDecisionSession";

const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
};

describe("createDecisionSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates conversation, proposals, and first round", async () => {
    const insertedConversation = { id: "conv-new", slug: "decision-1" };
    const insertedRound = { id: "round-1" };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "conversations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: "source-conv",
              hive_id: "hive-1",
              type: "understand",
              analysis_status: "ready",
            },
            error: null,
          }),
          insert: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: insertedConversation,
            error: null,
          }),
        };
      }
      if (table === "hive_members") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { role: "admin" },
            error: null,
          }),
        };
      }
      if (table === "decision_proposals") {
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "decision_rounds") {
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: insertedRound,
            error: null,
          }),
        };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    const result = await createDecisionSession(mockSupabase as any, "user-1", {
      hiveId: "hive-1",
      sourceConversationId: "source-conv",
      title: "Test Decision",
      selectedClusters: [0],
      selectedStatements: [
        {
          bucketId: "bucket-1",
          clusterIndex: 0,
          statementText: "Statement 1",
          agreePercent: 80,
        },
      ],
      consensusThreshold: 70,
      visibility: "hidden",
    });

    expect(result.conversationId).toBe("conv-new");
    expect(result.roundId).toBe("round-1");
  });

  it("requires admin role to create decision session", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "hive_members") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { role: "member" },
            error: null,
          }),
        };
      }
      if (table === "conversations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: "source-conv",
              hive_id: "hive-1",
              type: "understand",
              analysis_status: "ready",
            },
            error: null,
          }),
        };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    await expect(
      createDecisionSession(mockSupabase as any, "user-1", {
        hiveId: "hive-1",
        sourceConversationId: "source-conv",
        title: "Test",
        selectedClusters: [0],
        selectedStatements: [
          {
            bucketId: "b1",
            clusterIndex: 0,
            statementText: "S1",
            agreePercent: 80,
          },
        ],
        consensusThreshold: 70,
        visibility: "hidden",
      })
    ).rejects.toThrow("Only hive admins can create decision sessions");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/decision-space/server/__tests__/createDecisionSession.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the service**

```typescript
// lib/decision-space/server/createDecisionSession.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateDecisionSessionInput } from "@/lib/decision-space/schemas";
import type { DecisionVisibility } from "@/types/decision-space";

export interface CreateDecisionSessionResult {
  conversationId: string;
  slug: string | null;
  roundId: string;
}

/**
 * Create a new decision session with proposals and first voting round
 */
export async function createDecisionSession(
  supabase: SupabaseClient,
  userId: string,
  input: CreateDecisionSessionInput
): Promise<CreateDecisionSessionResult> {
  const {
    hiveId,
    sourceConversationId,
    title,
    description,
    selectedStatements,
    visibility,
    deadline,
  } = input;

  // 1. Verify source conversation exists and is valid
  const { data: sourceConv, error: sourceError } = await supabase
    .from("conversations")
    .select("id, hive_id, type, analysis_status")
    .eq("id", sourceConversationId)
    .maybeSingle();

  if (sourceError || !sourceConv) {
    throw new Error("Source conversation not found");
  }

  if (sourceConv.hive_id !== hiveId) {
    throw new Error("Source conversation must be in the same hive");
  }

  if (sourceConv.type !== "understand") {
    throw new Error("Source must be an understand session");
  }

  if (sourceConv.analysis_status !== "ready") {
    throw new Error("Source analysis must be complete");
  }

  // 2. Verify user is hive admin
  const { data: membership, error: memberError } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", hiveId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError || !membership) {
    throw new Error("User is not a member of this hive");
  }

  if (membership.role !== "admin") {
    throw new Error("Only hive admins can create decision sessions");
  }

  // 3. Create the conversation
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      hive_id: hiveId,
      type: "decide",
      title,
      description: description || null,
      phase: "vote_open",
      analysis_status: "ready", // No analysis needed for decision sessions
      created_by: userId,
      source_conversation_id: sourceConversationId,
    })
    .select("id, slug")
    .single();

  if (convError || !conversation) {
    console.error(
      "[createDecisionSession] Failed to create conversation:",
      convError
    );
    throw new Error("Failed to create decision session");
  }

  // 4. Create proposals from selected statements
  const proposals = selectedStatements.map((stmt, index) => ({
    conversation_id: conversation.id,
    source_bucket_id: stmt.bucketId,
    source_cluster_index: stmt.clusterIndex,
    statement_text: stmt.statementText,
    original_agree_percent: stmt.agreePercent,
    display_order: index,
  }));

  const { error: proposalsError } = await supabase
    .from("decision_proposals")
    .insert(proposals);

  if (proposalsError) {
    console.error(
      "[createDecisionSession] Failed to create proposals:",
      proposalsError
    );
    // Attempt cleanup
    await supabase.from("conversations").delete().eq("id", conversation.id);
    throw new Error("Failed to create proposals");
  }

  // 5. Create first voting round
  const { data: round, error: roundError } = await supabase
    .from("decision_rounds")
    .insert({
      conversation_id: conversation.id,
      round_number: 1,
      status: "voting_open",
      visibility: visibility,
      deadline: deadline || null,
    })
    .select("id")
    .single();

  if (roundError || !round) {
    console.error(
      "[createDecisionSession] Failed to create round:",
      roundError
    );
    // Attempt cleanup
    await supabase.from("conversations").delete().eq("id", conversation.id);
    throw new Error("Failed to create voting round");
  }

  return {
    conversationId: conversation.id,
    slug: conversation.slug,
    roundId: round.id,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/decision-space/server/__tests__/createDecisionSession.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/decision-space/server/createDecisionSession.ts lib/decision-space/server/__tests__/createDecisionSession.test.ts
git commit -m "feat: add createDecisionSession service

Creates decision conversation with snapshotted proposals and first voting round."
```

---

## Task 6: Service - Vote on Proposal

**Files:**

- Create: `lib/decision-space/server/voteOnDecisionProposal.ts`
- Create: `lib/decision-space/server/__tests__/voteOnDecisionProposal.test.ts`

**Step 1: Write the test**

```typescript
// lib/decision-space/server/__tests__/voteOnDecisionProposal.test.ts

import { voteOnDecisionProposal } from "../voteOnDecisionProposal";

const mockSupabase = {
  rpc: jest.fn(),
};

describe("voteOnDecisionProposal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls RPC and returns result on success", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { success: true, new_votes: 2, remaining_credits: 95 },
      error: null,
    });

    const result = await voteOnDecisionProposal(mockSupabase as any, "user-1", {
      roundId: "round-1",
      proposalId: "prop-1",
      delta: 1,
    });

    expect(result.success).toBe(true);
    expect(result.newVotes).toBe(2);
    expect(result.remainingCredits).toBe(95);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("vote_on_decision_proposal", {
      p_round_id: "round-1",
      p_proposal_id: "prop-1",
      p_user_id: "user-1",
      p_delta: 1,
    });
  });

  it("returns error when budget exceeded", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: {
        success: false,
        error_code: "BUDGET_EXCEEDED",
        remaining_credits: 3,
      },
      error: null,
    });

    const result = await voteOnDecisionProposal(mockSupabase as any, "user-1", {
      roundId: "round-1",
      proposalId: "prop-1",
      delta: 1,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("BUDGET_EXCEEDED");
  });

  it("throws on RPC error", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: "Database error" },
    });

    await expect(
      voteOnDecisionProposal(mockSupabase as any, "user-1", {
        roundId: "round-1",
        proposalId: "prop-1",
        delta: 1,
      })
    ).rejects.toThrow("Failed to record vote");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/decision-space/server/__tests__/voteOnDecisionProposal.test.ts`
Expected: FAIL

**Step 3: Write the service**

```typescript
// lib/decision-space/server/voteOnDecisionProposal.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  VoteOnProposalInput,
  VoteOnProposalResult,
} from "@/types/decision-space";

/**
 * Vote on a decision proposal using quadratic voting
 * Calls the vote_on_decision_proposal RPC function
 */
export async function voteOnDecisionProposal(
  supabase: SupabaseClient,
  userId: string,
  input: VoteOnProposalInput
): Promise<VoteOnProposalResult> {
  const { roundId, proposalId, delta } = input;

  const { data, error } = await supabase.rpc("vote_on_decision_proposal", {
    p_round_id: roundId,
    p_proposal_id: proposalId,
    p_user_id: userId,
    p_delta: delta,
  });

  if (error) {
    console.error("[voteOnDecisionProposal] RPC error:", error);
    throw new Error("Failed to record vote");
  }

  if (!data) {
    throw new Error("No response from vote RPC");
  }

  return {
    success: data.success,
    newVotes: data.new_votes,
    remainingCredits: data.remaining_credits,
    errorCode: data.error_code,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/decision-space/server/__tests__/voteOnDecisionProposal.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/decision-space/server/voteOnDecisionProposal.ts lib/decision-space/server/__tests__/voteOnDecisionProposal.test.ts
git commit -m "feat: add voteOnDecisionProposal service

Wraps vote_on_decision_proposal RPC with typed interface."
```

---

## Task 7: Service - Close Round & Generate Results

**Files:**

- Create: `lib/decision-space/server/closeDecisionRound.ts`
- Create: `lib/decision-space/server/generateDecisionResults.ts`

**Step 1: Write closeDecisionRound service**

```typescript
// lib/decision-space/server/closeDecisionRound.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDecisionResults } from "./generateDecisionResults";

export interface CloseDecisionRoundResult {
  roundId: string;
  resultsGenerated: boolean;
}

/**
 * Close a voting round and trigger results generation
 */
export async function closeDecisionRound(
  supabase: SupabaseClient,
  userId: string,
  roundId: string
): Promise<CloseDecisionRoundResult> {
  // 1. Fetch round and verify ownership
  const { data: round, error: roundError } = await supabase
    .from("decision_rounds")
    .select(
      `
      id,
      conversation_id,
      status,
      conversations!inner (
        hive_id
      )
    `
    )
    .eq("id", roundId)
    .maybeSingle();

  if (roundError || !round) {
    throw new Error("Round not found");
  }

  if (round.status !== "voting_open") {
    throw new Error("Round is not open for voting");
  }

  // 2. Verify user is hive admin
  const hiveId = (round.conversations as any).hive_id;
  const { data: membership } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", hiveId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || membership.role !== "admin") {
    throw new Error("Only hive admins can close voting rounds");
  }

  // 3. Close the round
  const { error: updateError } = await supabase
    .from("decision_rounds")
    .update({
      status: "voting_closed",
      closed_at: new Date().toISOString(),
    })
    .eq("id", roundId);

  if (updateError) {
    throw new Error("Failed to close round");
  }

  // 4. Generate results
  try {
    await generateDecisionResults(supabase, roundId);

    // Update status to results_generated
    await supabase
      .from("decision_rounds")
      .update({ status: "results_generated" })
      .eq("id", roundId);

    return { roundId, resultsGenerated: true };
  } catch (err) {
    console.error("[closeDecisionRound] Results generation failed:", err);
    return { roundId, resultsGenerated: false };
  }
}
```

**Step 2: Write generateDecisionResults service**

```typescript
// lib/decision-space/server/generateDecisionResults.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDecisionAnalysis } from "@/lib/analysis/openai/generateDecisionAnalysis";
import type { ProposalRanking } from "@/types/decision-space";

/**
 * Generate results for a closed decision round
 */
export async function generateDecisionResults(
  supabase: SupabaseClient,
  roundId: string
): Promise<void> {
  // 1. Fetch round info
  const { data: round, error: roundError } = await supabase
    .from("decision_rounds")
    .select("id, conversation_id, round_number")
    .eq("id", roundId)
    .single();

  if (roundError || !round) {
    throw new Error("Round not found");
  }

  // 2. Fetch all proposals for this conversation
  const { data: proposals, error: proposalsError } = await supabase
    .from("decision_proposals")
    .select("id, statement_text, original_agree_percent, display_order")
    .eq("conversation_id", round.conversation_id)
    .order("display_order", { ascending: true });

  if (proposalsError || !proposals) {
    throw new Error("Failed to fetch proposals");
  }

  // 3. Fetch vote totals per proposal
  const { data: votes, error: votesError } = await supabase
    .from("decision_votes")
    .select("proposal_id, votes")
    .eq("round_id", roundId);

  if (votesError) {
    throw new Error("Failed to fetch votes");
  }

  // 4. Calculate totals
  const voteTotals = new Map<string, number>();
  let totalVotesAllProposals = 0;

  for (const vote of votes || []) {
    const current = voteTotals.get(vote.proposal_id) || 0;
    voteTotals.set(vote.proposal_id, current + vote.votes);
    totalVotesAllProposals += vote.votes;
  }

  // 5. Build rankings
  const rankings: ProposalRanking[] = proposals
    .map((p) => ({
      proposalId: p.id,
      statementText: p.statement_text,
      totalVotes: voteTotals.get(p.id) || 0,
      votePercent:
        totalVotesAllProposals > 0
          ? Math.round(
              ((voteTotals.get(p.id) || 0) / totalVotesAllProposals) * 100
            )
          : 0,
      rank: 0, // Will be set after sorting
    }))
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .map((r, index) => ({ ...r, rank: index + 1 }));

  // 6. Fetch previous round results for comparison (if exists)
  let previousRankings: ProposalRanking[] | null = null;
  if (round.round_number > 1) {
    const { data: prevRound } = await supabase
      .from("decision_rounds")
      .select("id")
      .eq("conversation_id", round.conversation_id)
      .eq("round_number", round.round_number - 1)
      .single();

    if (prevRound) {
      const { data: prevResults } = await supabase
        .from("decision_results")
        .select("proposal_rankings")
        .eq("round_id", prevRound.id)
        .single();

      if (prevResults) {
        previousRankings = prevResults.proposal_rankings as ProposalRanking[];
      }
    }
  }

  // 7. Add change from previous
  if (previousRankings) {
    const prevRankMap = new Map(
      previousRankings.map((r) => [r.proposalId, r.rank])
    );
    for (const ranking of rankings) {
      const prevRank = prevRankMap.get(ranking.proposalId);
      if (prevRank !== undefined) {
        ranking.changeFromPrevious = prevRank - ranking.rank; // positive = moved up
      }
    }
  }

  // 8. Fetch source conversation data for AI analysis
  const { data: conversation } = await supabase
    .from("conversations")
    .select("source_conversation_id, title")
    .eq("id", round.conversation_id)
    .single();

  let sourceConsensusData: { statementText: string; agreePercent: number }[] =
    [];
  if (conversation?.source_conversation_id) {
    const { data: sourceBuckets } = await supabase
      .from("conversation_cluster_buckets")
      .select("consolidated_statement")
      .eq("conversation_id", conversation.source_conversation_id);

    // For simplicity, use original_agree_percent from proposals
    sourceConsensusData = proposals.map((p) => ({
      statementText: p.statement_text,
      agreePercent: p.original_agree_percent || 0,
    }));
  }

  // 9. Generate AI analysis
  const aiAnalysis = await generateDecisionAnalysis({
    sessionTitle: conversation?.title || "Decision Session",
    rankings,
    previousRankings,
    sourceConsensusData,
    roundNumber: round.round_number,
    totalVoters: new Set((votes || []).map((v) => v.proposal_id)).size, // Approximate
  });

  // 10. Save results
  const { error: insertError } = await supabase
    .from("decision_results")
    .insert({
      round_id: roundId,
      proposal_rankings: rankings,
      ai_analysis: aiAnalysis,
    });

  if (insertError) {
    console.error(
      "[generateDecisionResults] Failed to save results:",
      insertError
    );
    throw new Error("Failed to save results");
  }
}
```

**Step 3: Commit**

```bash
git add lib/decision-space/server/closeDecisionRound.ts lib/decision-space/server/generateDecisionResults.ts
git commit -m "feat: add closeDecisionRound and generateDecisionResults services

Closes voting rounds and generates ranked results with AI analysis."
```

---

## Task 8: OpenAI - Generate Decision Analysis

**Files:**

- Create: `lib/analysis/openai/generateDecisionAnalysis.ts`

**Step 1: Write the generator**

```typescript
// lib/analysis/openai/generateDecisionAnalysis.ts

import { openaiClient } from "./client";
import type { ProposalRanking } from "@/types/decision-space";

export interface GenerateDecisionAnalysisInput {
  sessionTitle: string;
  rankings: ProposalRanking[];
  previousRankings: ProposalRanking[] | null;
  sourceConsensusData: { statementText: string; agreePercent: number }[];
  roundNumber: number;
  totalVoters: number;
}

/**
 * Generate AI analysis of decision results
 */
export async function generateDecisionAnalysis(
  input: GenerateDecisionAnalysisInput
): Promise<string> {
  const {
    sessionTitle,
    rankings,
    previousRankings,
    sourceConsensusData,
    roundNumber,
    totalVoters,
  } = input;

  const topResults = rankings.slice(0, 5);
  const minorityResults = rankings.filter(
    (r) => r.votePercent >= 10 && r.rank > 3
  );

  const prompt = `You are analyzing the results of a group decision-making session titled "${sessionTitle}".

## Voting Results (Round ${roundNumber})

Total voters: ${totalVoters}

### Top Outcomes (by vote count):
${topResults.map((r) => `${r.rank}. "${r.statementText}" - ${r.totalVotes} votes (${r.votePercent}%)${r.changeFromPrevious !== undefined ? ` [${r.changeFromPrevious > 0 ? "+" : ""}${r.changeFromPrevious} from previous round]` : ""}`).join("\n")}

${
  minorityResults.length > 0
    ? `### Notable Minority Positions (10%+ votes but not top 3):
${minorityResults.map((r) => `- "${r.statementText}" - ${r.totalVotes} votes (${r.votePercent}%)`).join("\n")}`
    : ""
}

${
  sourceConsensusData.length > 0
    ? `### Original Consensus Data (from understand session):
${sourceConsensusData
  .slice(0, 10)
  .map(
    (s) =>
      `- "${s.statementText.substring(0, 100)}..." - ${s.agreePercent}% agreement`
  )
  .join("\n")}`
    : ""
}

${
  previousRankings
    ? `### Comparison to Previous Round:
${rankings
  .slice(0, 5)
  .map((r) => {
    const change = r.changeFromPrevious;
    if (change === undefined) return "";
    if (change > 0)
      return `- "${r.statementText.substring(0, 50)}..." moved UP ${change} position(s)`;
    if (change < 0)
      return `- "${r.statementText.substring(0, 50)}..." moved DOWN ${Math.abs(change)} position(s)`;
    return `- "${r.statementText.substring(0, 50)}..." stayed at same position`;
  })
  .filter(Boolean)
  .join("\n")}`
    : ""
}

---

Generate a decision analysis document with these sections:

## Decision Summary
1-2 paragraphs summarizing what was decided, participation, and vote distribution.

## Top Outcomes
Explain the top 3-5 voted items and why they may have resonated with the group.

## Minority Perspectives
Acknowledge items that received significant (10%+) votes but didn't win. These represent important dissent.

## Comparison to Original Consensus
How do the voting results align with the original understand session's feedback consensus? Note any interesting validations or tensions.

## Recommended Next Steps
Concrete actionable items based on results.

## Suggested Follow-up Sessions
Recommend 2-3 specific Hivemind sessions to continue the process, such as:
- "Run an understand session to explore [topic] further"
- "Create a decide session focused on implementation options for [winning proposal]"
- "Gather feedback on [area of tension] before proceeding"

Keep the analysis concise but actionable. Use markdown formatting.`;

  const response = await openaiClient.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2000,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || "Analysis generation failed.";
}
```

**Step 2: Commit**

```bash
git add lib/analysis/openai/generateDecisionAnalysis.ts
git commit -m "feat: add generateDecisionAnalysis for AI-powered result summaries"
```

---

## Task 9: API Routes

**Files:**

- Create: `app/api/decision-space/setup/route.ts`
- Create: `app/api/decision-space/route.ts`
- Create: `app/api/decision-space/[conversationId]/vote/route.ts`
- Create: `app/api/decision-space/[conversationId]/rounds/[roundId]/close/route.ts`

**Step 1: Setup data route**

```typescript
// app/api/decision-space/setup/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { getDecisionSetupData } from "@/lib/decision-space/server/getDecisionSetupData";
import { getDecisionSetupDataSchema } from "@/lib/decision-space/schemas";
import { jsonError } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const sourceConversationId = searchParams.get("sourceConversationId");

    const parseResult = getDecisionSetupDataSchema.safeParse({
      sourceConversationId,
    });
    if (!parseResult.success) {
      return jsonError(
        "sourceConversationId is required",
        400,
        "VALIDATION_ERROR"
      );
    }

    const supabase = await supabaseServerClient();
    const data = await getDecisionSetupData(
      supabase,
      userId,
      parseResult.data.sourceConversationId
    );

    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/decision-space/setup]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonError(message, 500, "INTERNAL_ERROR");
  }
}
```

**Step 2: Create session route**

```typescript
// app/api/decision-space/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { createDecisionSession } from "@/lib/decision-space/server/createDecisionSession";
import { createDecisionSessionSchema } from "@/lib/decision-space/schemas";
import { jsonError } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    const body = await request.json();
    const parseResult = createDecisionSessionSchema.safeParse(body);

    if (!parseResult.success) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    const supabase = await supabaseServerClient();
    const result = await createDecisionSession(
      supabase,
      userId,
      parseResult.data
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[POST /api/decision-space]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("admin") ? 403 : 500;
    return jsonError(
      message,
      status,
      status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR"
    );
  }
}
```

**Step 3: Vote route**

```typescript
// app/api/decision-space/[conversationId]/vote/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { voteOnDecisionProposal } from "@/lib/decision-space/server/voteOnDecisionProposal";
import { voteOnProposalSchema } from "@/lib/decision-space/schemas";
import { jsonError } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    const body = await request.json();
    const parseResult = voteOnProposalSchema.safeParse(body);

    if (!parseResult.success) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    const supabase = await supabaseServerClient();
    const result = await voteOnDecisionProposal(
      supabase,
      userId,
      parseResult.data
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/decision-space/.../vote]", err);
    return jsonError("Failed to record vote", 500, "INTERNAL_ERROR");
  }
}
```

**Step 4: Close round route**

```typescript
// app/api/decision-space/[conversationId]/rounds/[roundId]/close/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { closeDecisionRound } from "@/lib/decision-space/server/closeDecisionRound";
import { jsonError } from "@/lib/api/errors";

interface RouteParams {
  params: Promise<{ conversationId: string; roundId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;
    const { roundId } = await params;

    const supabase = await supabaseServerClient();
    const result = await closeDecisionRound(supabase, userId, roundId);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/decision-space/.../close]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("admin") ? 403 : 500;
    return jsonError(
      message,
      status,
      status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR"
    );
  }
}
```

**Step 5: Commit**

```bash
git add app/api/decision-space/
git commit -m "feat: add decision space API routes

- GET /api/decision-space/setup - fetch clusters and statements
- POST /api/decision-space - create decision session
- POST /api/decision-space/[id]/vote - cast quadratic vote
- POST /api/decision-space/[id]/rounds/[roundId]/close - close round"
```

---

## Task 10: React Hook - Decision Setup Wizard

**Files:**

- Create: `lib/decision-space/react/useDecisionSetupWizard.ts`

**Step 1: Write the hook**

```typescript
// lib/decision-space/react/useDecisionSetupWizard.ts

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  ClusterSelectionItem,
  StatementSelectionItem,
  DecisionVisibility,
  SelectedStatement,
} from "@/types/decision-space";

export interface UseDecisionSetupWizardProps {
  hiveId: string;
  hiveSlug?: string | null;
  open: boolean;
}

export interface UseDecisionSetupWizardReturn {
  // Navigation
  step: 1 | 2 | 3 | 4;
  loading: boolean;
  error: string | null;

  // Step 1: Source selection
  sourceConversations: {
    id: string;
    title: string;
    clusterCount: number;
    date: string;
  }[];
  selectedSourceId: string | null;
  setSelectedSourceId: (id: string | null) => void;

  // Step 2: Cluster selection
  clusters: ClusterSelectionItem[];
  toggleCluster: (index: number) => void;
  selectAllClusters: () => void;
  deselectAllClusters: () => void;

  // Step 3: Statement selection
  statements: StatementSelectionItem[];
  consensusThreshold: number;
  setConsensusThreshold: (value: number) => void;
  toggleStatement: (bucketId: string) => void;
  selectAllInCluster: (clusterIndex: number) => void;

  // Step 4: Settings
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  visibility: DecisionVisibility;
  setVisibility: (value: DecisionVisibility) => void;
  deadline: string;
  setDeadline: (value: string) => void;

  // Actions
  onNext: () => Promise<void>;
  onBack: () => void;
  onFinish: () => Promise<void>;
}

export function useDecisionSetupWizard({
  hiveId,
  hiveSlug,
  open,
}: UseDecisionSetupWizardProps): UseDecisionSetupWizardReturn {
  const router = useRouter();

  // Navigation state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Source selection
  const [sourceConversations, setSourceConversations] = useState<
    { id: string; title: string; clusterCount: number; date: string }[]
  >([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Step 2: Cluster selection
  const [clusters, setClusters] = useState<ClusterSelectionItem[]>([]);

  // Step 3: Statement selection
  const [statements, setStatements] = useState<StatementSelectionItem[]>([]);
  const [consensusThreshold, setConsensusThreshold] = useState(70);

  // Step 4: Settings
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<DecisionVisibility>("hidden");
  const [deadline, setDeadline] = useState("");

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setError(null);
    setSelectedSourceId(null);
    setClusters([]);
    setStatements([]);
    setConsensusThreshold(70);
    setTitle("");
    setDescription("");
    setVisibility("hidden");
    setDeadline("");
  }, [open]);

  // Fetch source conversations on mount
  useEffect(() => {
    if (!open || !hiveId) return;

    let cancelled = false;

    fetch(`/api/hives/${hiveId}/understand-sessions?status=ready`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setSourceConversations(data.sessions || []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useDecisionSetupWizard] Failed to fetch sources:", err);
        setError("Failed to load understand sessions");
      });

    return () => {
      cancelled = true;
    };
  }, [open, hiveId]);

  // Fetch setup data when source is selected
  useEffect(() => {
    if (!selectedSourceId) return;

    let cancelled = false;
    setLoading(true);

    fetch(`/api/decision-space/setup?sourceConversationId=${selectedSourceId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setClusters(data.clusters || []);
        setStatements(data.statements || []);
        setTitle(`Decision: ${data.sourceTitle}`);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(
          "[useDecisionSetupWizard] Failed to fetch setup data:",
          err
        );
        setError("Failed to load clusters and statements");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSourceId]);

  // Update statement recommendations when threshold changes
  useEffect(() => {
    setStatements((prev) =>
      prev.map((s) => ({
        ...s,
        recommended:
          s.agreePercent !== null && s.agreePercent >= consensusThreshold,
        selected:
          s.selected ||
          (s.agreePercent !== null && s.agreePercent >= consensusThreshold),
      }))
    );
  }, [consensusThreshold]);

  // Cluster actions
  const toggleCluster = useCallback((index: number) => {
    setClusters((prev) =>
      prev.map((c) =>
        c.clusterIndex === index ? { ...c, selected: !c.selected } : c
      )
    );
  }, []);

  const selectAllClusters = useCallback(() => {
    setClusters((prev) => prev.map((c) => ({ ...c, selected: true })));
  }, []);

  const deselectAllClusters = useCallback(() => {
    setClusters((prev) => prev.map((c) => ({ ...c, selected: false })));
  }, []);

  // Statement actions
  const toggleStatement = useCallback((bucketId: string) => {
    setStatements((prev) =>
      prev.map((s) =>
        s.bucketId === bucketId ? { ...s, selected: !s.selected } : s
      )
    );
  }, []);

  const selectAllInCluster = useCallback((clusterIndex: number) => {
    setStatements((prev) =>
      prev.map((s) =>
        s.clusterIndex === clusterIndex ? { ...s, selected: true } : s
      )
    );
  }, []);

  // Navigation
  const onNext = useCallback(async () => {
    setError(null);

    if (step === 1) {
      if (!selectedSourceId) {
        setError("Select an understand session to continue");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      const selectedCount = clusters.filter((c) => c.selected).length;
      if (selectedCount === 0) {
        setError("Select at least one cluster");
        return;
      }
      // Filter statements to only show from selected clusters
      const selectedClusterIndices = new Set(
        clusters.filter((c) => c.selected).map((c) => c.clusterIndex)
      );
      setStatements((prev) =>
        prev.map((s) => ({
          ...s,
          selected: selectedClusterIndices.has(s.clusterIndex)
            ? s.recommended
            : false,
        }))
      );
      setStep(3);
    } else if (step === 3) {
      const selectedCount = statements.filter((s) => s.selected).length;
      if (selectedCount === 0) {
        setError("Select at least one statement");
        return;
      }
      setStep(4);
    }
  }, [step, selectedSourceId, clusters, statements]);

  const onBack = useCallback(() => {
    setError(null);
    if (step > 1) {
      setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
    }
  }, [step]);

  const onFinish = useCallback(async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError(null);

    const selectedStatements: SelectedStatement[] = statements
      .filter((s) => s.selected)
      .map((s) => ({
        bucketId: s.bucketId,
        clusterIndex: s.clusterIndex,
        statementText: s.statementText,
        agreePercent: s.agreePercent,
      }));

    try {
      const response = await fetch("/api/decision-space", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hiveId,
          sourceConversationId: selectedSourceId,
          title: title.trim(),
          description: description.trim() || undefined,
          selectedClusters: clusters
            .filter((c) => c.selected)
            .map((c) => c.clusterIndex),
          selectedStatements,
          consensusThreshold,
          visibility,
          deadline: deadline || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create session");
      }

      const result = await response.json();
      const hiveKey = hiveSlug || hiveId;
      router.push(
        `/hives/${hiveKey}/conversations/${result.conversationId}/decide`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }, [
    title,
    description,
    hiveId,
    hiveSlug,
    selectedSourceId,
    clusters,
    statements,
    consensusThreshold,
    visibility,
    deadline,
    router,
  ]);

  return {
    step,
    loading,
    error,
    sourceConversations,
    selectedSourceId,
    setSelectedSourceId,
    clusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    statements,
    consensusThreshold,
    setConsensusThreshold,
    toggleStatement,
    selectAllInCluster,
    title,
    setTitle,
    description,
    setDescription,
    visibility,
    setVisibility,
    deadline,
    setDeadline,
    onNext,
    onBack,
    onFinish,
  };
}
```

**Step 2: Commit**

```bash
git add lib/decision-space/react/useDecisionSetupWizard.ts
git commit -m "feat: add useDecisionSetupWizard hook for 4-step setup flow"
```

---

## Task 11: UI Component - Decision Setup Wizard

**Files:**

- Create: `app/components/decision-setup-wizard.tsx`

This task creates the 4-step wizard UI using the hook from Task 10. The component renders:

- Step 1: Source session dropdown
- Step 2: Cluster selection cards with checkboxes
- Step 3: Statement selection with threshold slider
- Step 4: Title, description, visibility, deadline settings

Due to length, implement following the patterns in `new-session-wizard.tsx`:

- Use Tailwind for all styling
- Use the hook for all state/logic
- Keep rendering thin
- Include loading states and error display

**Commit:**

```bash
git add app/components/decision-setup-wizard.tsx
git commit -m "feat: add DecisionSetupWizard UI component"
```

---

## Task 12: Decision Session Tabs UI

**Files:**

- Create: `app/(main)/hives/[hiveId]/conversations/[conversationId]/decide/page.tsx`
- Create: `app/components/conversation/DecisionListenTab.tsx`
- Create: `app/components/conversation/DecisionVoteTab.tsx`
- Create: `app/components/conversation/DecisionResultsTab.tsx`

These components implement the 3-tab interface:

- **Listen Tab**: Clusters with collapsible statements, expandable to show original responses
- **Vote Tab**: Quadratic voting interface with budget display
- **Results Tab**: Two-column layout with rankings and AI analysis

Follow existing tab patterns in `app/components/conversation/`.

**Commit after each component:**

```bash
git add app/(main)/hives/[hiveId]/conversations/[conversationId]/decide/
git commit -m "feat: add decision session page with tabs"

git add app/components/conversation/DecisionListenTab.tsx
git commit -m "feat: add DecisionListenTab with expandable statements"

git add app/components/conversation/DecisionVoteTab.tsx
git commit -m "feat: add DecisionVoteTab with quadratic voting UI"

git add app/components/conversation/DecisionResultsTab.tsx
git commit -m "feat: add DecisionResultsTab with rankings and AI analysis"
```

---

## Task 13: Documentation Updates

**Files:**

- Modify: `docs/feature-map.md`
- Modify: `lib/conversations/README.md`
- Modify: `supabase/README.md`

**Step 1: Update feature-map.md**

Add decision space section:

```markdown
## Decision Space

### Setup Flow

- Entry: `app/components/decision-setup-wizard.tsx`
- Hook: `lib/decision-space/react/useDecisionSetupWizard.ts`
- API: `GET /api/decision-space/setup`, `POST /api/decision-space`
- Service: `lib/decision-space/server/createDecisionSession.ts`

### Voting

- UI: `app/components/conversation/DecisionVoteTab.tsx`
- API: `POST /api/decision-space/[id]/vote`
- Service: `lib/decision-space/server/voteOnDecisionProposal.ts`
- RPC: `vote_on_decision_proposal` (budget-enforced quadratic voting)

### Results

- UI: `app/components/conversation/DecisionResultsTab.tsx`
- API: `POST /api/decision-space/[id]/rounds/[roundId]/close`
- Service: `lib/decision-space/server/closeDecisionRound.ts`
- AI: `lib/analysis/openai/generateDecisionAnalysis.ts`
```

**Step 2: Update lib/conversations/README.md**

Add decision session lifecycle section.

**Step 3: Update supabase/README.md**

Add migration 024 to the list.

**Step 4: Commit**

```bash
git add docs/feature-map.md lib/conversations/README.md supabase/README.md
git commit -m "docs: add decision space documentation"
```

---

## Task 14: Integration Tests

**Files:**

- Create: `lib/decision-space/server/__tests__/integration.test.ts`

Write integration tests covering:

1. Full setup flow: fetch data → create session → verify proposals created
2. Voting flow: cast votes → verify budget enforcement
3. Close round flow: close → verify results generated

**Commit:**

```bash
git add lib/decision-space/server/__tests__/integration.test.ts
git commit -m "test: add decision space integration tests"
```

---

## Task 15: Final Verification

**Step 1: Run all checks**

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

**Step 2: Manual testing**

1. Create an understand session with responses
2. Run analysis to completion
3. Create a decision session from it
4. Test voting with budget constraints
5. Close round and verify results

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete decision space implementation"
```

---

## Summary

This plan implements Decision Space in 15 tasks:

| Task | Description            | Files                                                        |
| ---- | ---------------------- | ------------------------------------------------------------ |
| 1    | Database migration     | `024_decision_space_tables.sql`                              |
| 2    | TypeScript types       | `types/decision-space.ts`                                    |
| 3    | Zod schemas            | `lib/decision-space/schemas.ts`                              |
| 4    | Setup data service     | `getDecisionSetupData.ts`                                    |
| 5    | Create session service | `createDecisionSession.ts`                                   |
| 6    | Vote service           | `voteOnDecisionProposal.ts`                                  |
| 7    | Close round services   | `closeDecisionRound.ts`, `generateDecisionResults.ts`        |
| 8    | AI analysis            | `generateDecisionAnalysis.ts`                                |
| 9    | API routes             | `app/api/decision-space/`                                    |
| 10   | Setup wizard hook      | `useDecisionSetupWizard.ts`                                  |
| 11   | Setup wizard UI        | `decision-setup-wizard.tsx`                                  |
| 12   | Session tabs UI        | `DecisionListenTab`, `DecisionVoteTab`, `DecisionResultsTab` |
| 13   | Documentation          | `feature-map.md`, READMEs                                    |
| 14   | Integration tests      | `integration.test.ts`                                        |
| 15   | Final verification     | All checks pass                                              |
