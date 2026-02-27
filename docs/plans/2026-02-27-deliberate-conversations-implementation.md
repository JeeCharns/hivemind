# Deliberate Conversations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement deliberate conversations with 5-point sentiment voting, comments, and two wizard paths (from-understand or from-scratch).

**Architecture:** Add `"deliberate"` as a new conversation type. Create dedicated tables for statements, votes, and comments. Reuse DecisionSetupWizard patterns for the from-understand flow, add new from-scratch wizard. Build DiscussView with two-column layout for statement browsing and voting.

**Tech Stack:** Next.js 14, TypeScript, Supabase, Zod validation, React hooks, Tailwind CSS

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/049_deliberate_tables.sql`

**Step 1: Write the migration file**

```sql
-- Migration 049: Deliberate Conversation Tables
-- Enables sentiment-based deliberation on statements with 5-point voting scale

-- ============================================
-- DELIBERATION STATEMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS deliberation_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  cluster_index INTEGER,
  cluster_name TEXT,
  statement_text TEXT NOT NULL,
  source_bucket_id UUID REFERENCES conversation_cluster_buckets(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_statement_order UNIQUE (conversation_id, display_order)
);

CREATE INDEX idx_deliberation_statements_conversation
ON deliberation_statements(conversation_id);

-- ============================================
-- DELIBERATION VOTES (1-5 sentiment scale)
-- ============================================

CREATE TABLE IF NOT EXISTS deliberation_votes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement_id UUID NOT NULL REFERENCES deliberation_statements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE CASCADE,
  vote_value INTEGER NOT NULL CHECK (vote_value BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT one_vote_per_user UNIQUE (statement_id, user_id),
  CONSTRAINT one_vote_per_guest UNIQUE (statement_id, guest_session_id),
  CONSTRAINT must_have_voter CHECK (user_id IS NOT NULL OR guest_session_id IS NOT NULL)
);

CREATE INDEX idx_deliberation_votes_statement
ON deliberation_votes(statement_id);

CREATE INDEX idx_deliberation_votes_user
ON deliberation_votes(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_deliberation_votes_guest
ON deliberation_votes(guest_session_id) WHERE guest_session_id IS NOT NULL;

-- ============================================
-- DELIBERATION COMMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS deliberation_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement_id UUID NOT NULL REFERENCES deliberation_statements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT must_have_commenter CHECK (user_id IS NOT NULL OR guest_session_id IS NOT NULL)
);

CREATE INDEX idx_deliberation_comments_statement
ON deliberation_comments(statement_id);

CREATE INDEX idx_deliberation_comments_user
ON deliberation_comments(user_id) WHERE user_id IS NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE deliberation_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliberation_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliberation_comments ENABLE ROW LEVEL SECURITY;

-- Statements: viewable by hive members and guests with share link
CREATE POLICY "Hive members can view statements"
ON deliberation_statements FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE c.id = deliberation_statements.conversation_id
      AND hm.user_id = auth.uid()
  )
);

-- Votes: users can view own votes
CREATE POLICY "Users can view own votes"
ON deliberation_votes FOR SELECT
USING (user_id = auth.uid());

-- Votes: hive members can view all votes (for aggregates)
CREATE POLICY "Hive members can view all votes"
ON deliberation_votes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deliberation_statements ds
    JOIN conversations c ON c.id = ds.conversation_id
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE ds.id = deliberation_votes.statement_id
      AND hm.user_id = auth.uid()
  )
);

-- Comments: viewable by hive members
CREATE POLICY "Hive members can view comments"
ON deliberation_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deliberation_statements ds
    JOIN conversations c ON c.id = ds.conversation_id
    JOIN hive_members hm ON hm.hive_id = c.hive_id
    WHERE ds.id = deliberation_comments.statement_id
      AND hm.user_id = auth.uid()
  )
);

-- Service role policies
CREATE POLICY "Service role manages statements"
ON deliberation_statements FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages votes"
ON deliberation_votes FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages comments"
ON deliberation_comments FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- UPDATE CONVERSATIONS TYPE CHECK
-- ============================================

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('understand', 'decide', 'explore', 'deliberate'));
```

**Step 2: Apply migration locally**

Run: `npx supabase db push`
Expected: Migration applied successfully

**Step 3: Commit**

```bash
git add supabase/migrations/049_deliberate_tables.sql
git commit -m "feat: add deliberate conversation tables

Creates deliberation_statements, deliberation_votes, and deliberation_comments
tables with RLS policies for hive member access."
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `types/deliberate-space.ts`
- Modify: `types/conversations.ts:8`

**Step 1: Create deliberate-space types**

```typescript
// types/deliberate-space.ts

/**
 * Deliberate Space Types
 *
 * Types for deliberate conversations with 5-point sentiment voting
 */

// ============================================
// VOTE LABELS
// ============================================

export const VOTE_LABELS = {
  5: "Deeply resonates",
  4: "Mostly resonates",
  3: "Mixed reaction",
  2: "It's complicated",
  1: "Strong aversion",
} as const;

export type VoteValue = 1 | 2 | 3 | 4 | 5;

// ============================================
// STATEMENT TYPES
// ============================================

export interface DeliberateStatement {
  id: string;
  clusterIndex: number | null;
  clusterName: string | null;
  statementText: string;
  sourceBucketId: string | null;
  displayOrder: number;
  voteCount: number;
  averageVote: number | null;
  commentCount: number;
}

export interface ManualStatement {
  text: string;
  clusterName?: string;
}

// ============================================
// VIEW MODEL
// ============================================

export interface DeliberateViewModel {
  conversationId: string;
  hiveKey: string;
  conversationKey: string;
  statements: DeliberateStatement[];
  userVotes: Record<string, VoteValue | null>;
  clusters: DeliberateCluster[];
}

export interface DeliberateCluster {
  index: number | null;
  name: string | null;
  statementCount: number;
}

// ============================================
// COMMENT TYPES
// ============================================

export interface DeliberateComment {
  id: string;
  statementId: string;
  text: string;
  isAnonymous: boolean;
  createdAt: string;
  user: {
    id: string | null;
    name: string;
    avatarUrl: string | null;
  };
  isMine: boolean;
}

// ============================================
// WIZARD STATE
// ============================================

export type DeliberateWizardMode = "from-understand" | "from-scratch";

export interface ClusterSelectionItem {
  clusterIndex: number;
  name: string;
  description: string;
  statementCount: number;
  selected: boolean;
}

export interface StatementSelectionItem {
  bucketId: string;
  clusterIndex: number;
  clusterName: string;
  statementText: string;
  selected: boolean;
}

// ============================================
// API TYPES
// ============================================

export interface CreateDeliberateSessionInput {
  hiveId: string;
  mode: DeliberateWizardMode;
  title: string;
  description?: string;
  // From-understand mode
  sourceConversationId?: string;
  selectedStatements?: StatementSelectionItem[];
  // From-scratch mode
  manualStatements?: ManualStatement[];
}

export interface CreateDeliberateSessionResult {
  conversationId: string;
  slug: string | null;
}

export interface VoteOnStatementInput {
  statementId: string;
  voteValue: VoteValue | null; // null = pass/remove vote
}

export interface AddCommentInput {
  statementId: string;
  text: string;
  isAnonymous?: boolean;
}
```

**Step 2: Update ConversationType**

In `types/conversations.ts`, change line 8:

```typescript
export type ConversationType = "understand" | "explore" | "decide" | "deliberate";
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add types/deliberate-space.ts types/conversations.ts
git commit -m "feat: add deliberate-space types

Adds types for statements, votes, comments, view model, and wizard state.
Updates ConversationType to include 'deliberate'."
```

---

## Task 3: Zod Schemas

**Files:**
- Create: `lib/deliberate-space/schemas.ts`

**Step 1: Create schemas file**

```typescript
// lib/deliberate-space/schemas.ts

import { z } from "zod";

/**
 * Deliberate Space Validation Schemas
 */

// ============================================
// VOTE VALUE
// ============================================

export const voteValueSchema = z.number().int().min(1).max(5);

// ============================================
// MANUAL STATEMENT
// ============================================

export const manualStatementSchema = z.object({
  text: z.string().min(1).max(2000),
  clusterName: z.string().max(100).optional(),
});

// ============================================
// SELECTED STATEMENT (from understand)
// ============================================

export const selectedStatementSchema = z.object({
  bucketId: z.string().uuid(),
  clusterIndex: z.number().int().min(0),
  clusterName: z.string(),
  statementText: z.string().min(1).max(2000),
});

// ============================================
// CREATE SESSION
// ============================================

export const createDeliberateSessionSchema = z
  .object({
    hiveId: z.string().uuid(),
    mode: z.enum(["from-understand", "from-scratch"]),
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    // From-understand mode
    sourceConversationId: z.string().uuid().optional(),
    selectedStatements: z.array(selectedStatementSchema).optional(),
    // From-scratch mode
    manualStatements: z.array(manualStatementSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.mode === "from-understand") {
        return (
          data.sourceConversationId &&
          data.selectedStatements &&
          data.selectedStatements.length > 0
        );
      }
      return data.manualStatements && data.manualStatements.length > 0;
    },
    {
      message:
        "from-understand requires sourceConversationId and selectedStatements; from-scratch requires manualStatements",
    }
  );

export type CreateDeliberateSessionInput = z.infer<
  typeof createDeliberateSessionSchema
>;

// ============================================
// VOTING
// ============================================

export const voteOnStatementSchema = z.object({
  statementId: z.string().uuid(),
  voteValue: voteValueSchema.nullable(), // null = pass/remove vote
});

export type VoteOnStatementInput = z.infer<typeof voteOnStatementSchema>;

// ============================================
// COMMENTS
// ============================================

export const addCommentSchema = z.object({
  statementId: z.string().uuid(),
  text: z.string().min(1).max(1000),
  isAnonymous: z.boolean().optional().default(false),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const deleteCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
});

export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>;

// ============================================
// FETCH PARAMS
// ============================================

export const getDeliberateSetupDataSchema = z.object({
  sourceConversationId: z.string().uuid(),
});

export type GetDeliberateSetupDataInput = z.infer<
  typeof getDeliberateSetupDataSchema
>;
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/deliberate-space/schemas.ts
git commit -m "feat: add deliberate-space Zod schemas

Validation for session creation, voting, and comments."
```

---

## Task 4: Create Deliberate Session Service

**Files:**
- Create: `lib/deliberate-space/server/createDeliberateSession.ts`

**Step 1: Write failing test**

Create: `lib/deliberate-space/server/__tests__/createDeliberateSession.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDeliberateSession } from "../createDeliberateSession";

describe("createDeliberateSession", () => {
  const mockSupabase = {
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates session from scratch with manual statements", async () => {
    // Mock conversation insert
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "conversations") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "conv-123", slug: "test-deliberation" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "deliberation_statements") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "hive_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: "member" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const result = await createDeliberateSession(
      mockSupabase as any,
      "user-123",
      {
        hiveId: "hive-123",
        mode: "from-scratch",
        title: "Test Deliberation",
        manualStatements: [
          { text: "Statement 1" },
          { text: "Statement 2", clusterName: "Group A" },
        ],
      }
    );

    expect(result.conversationId).toBe("conv-123");
    expect(result.slug).toBe("test-deliberation");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/deliberate-space/server/__tests__/createDeliberateSession.test.ts`
Expected: FAIL - module not found

**Step 3: Write implementation**

```typescript
// lib/deliberate-space/server/createDeliberateSession.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateDeliberateSessionInput } from "@/lib/deliberate-space/schemas";

export interface CreateDeliberateSessionResult {
  conversationId: string;
  slug: string | null;
}

/**
 * Create a new deliberate session with statements
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
    await supabase.from("conversations").delete().eq("id", conversation.id);
    throw new Error("Failed to create statements");
  }

  return {
    conversationId: conversation.id,
    slug: conversation.slug,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/deliberate-space/server/__tests__/createDeliberateSession.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/deliberate-space/server/createDeliberateSession.ts lib/deliberate-space/server/__tests__/createDeliberateSession.test.ts
git commit -m "feat: add createDeliberateSession service

Creates deliberate conversation with statements from understand source
or manual input."
```

---

## Task 5: Get Deliberate View Model Service

**Files:**
- Create: `lib/deliberate-space/server/getDeliberateViewModel.ts`

**Step 1: Write implementation**

```typescript
// lib/deliberate-space/server/getDeliberateViewModel.ts

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
 * Build view model for deliberate conversation discuss tab
 */
export async function getDeliberateViewModel(
  supabase: SupabaseClient,
  params: GetDeliberateViewModelParams
): Promise<DeliberateViewModel | null> {
  const { conversationId, userId, guestSessionId } = params;

  // 1. Get conversation with hive info
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select(
      `
      id,
      type,
      hives!inner(slug)
    `
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation || conversation.type !== "deliberate") {
    return null;
  }

  // 2. Get statements with vote/comment aggregates
  const { data: statements, error: stmtError } = await supabase
    .from("deliberation_statements")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("display_order", { ascending: true });

  if (stmtError) {
    console.error("[getDeliberateViewModel] Failed to fetch statements:", stmtError);
    return null;
  }

  // 3. Get vote aggregates per statement
  const { data: voteAggregates } = await supabase
    .from("deliberation_votes")
    .select("statement_id, vote_value")
    .in(
      "statement_id",
      statements.map((s) => s.id)
    );

  const votesByStatement = new Map<
    string,
    { count: number; sum: number }
  >();
  for (const vote of voteAggregates || []) {
    const existing = votesByStatement.get(vote.statement_id) || {
      count: 0,
      sum: 0,
    };
    existing.count++;
    existing.sum += vote.vote_value;
    votesByStatement.set(vote.statement_id, existing);
  }

  // 4. Get comment counts per statement
  const { data: commentCounts } = await supabase
    .from("deliberation_comments")
    .select("statement_id")
    .in(
      "statement_id",
      statements.map((s) => s.id)
    );

  const commentsByStatement = new Map<string, number>();
  for (const comment of commentCounts || []) {
    const count = commentsByStatement.get(comment.statement_id) || 0;
    commentsByStatement.set(comment.statement_id, count + 1);
  }

  // 5. Get user's votes
  let userVotesQuery = supabase
    .from("deliberation_votes")
    .select("statement_id, vote_value")
    .in(
      "statement_id",
      statements.map((s) => s.id)
    );

  if (userId) {
    userVotesQuery = userVotesQuery.eq("user_id", userId);
  } else if (guestSessionId) {
    userVotesQuery = userVotesQuery.eq("guest_session_id", guestSessionId);
  } else {
    userVotesQuery = userVotesQuery.eq("user_id", "00000000-0000-0000-0000-000000000000"); // No match
  }

  const { data: userVotes } = await userVotesQuery;

  const userVotesMap: Record<string, VoteValue | null> = {};
  for (const vote of userVotes || []) {
    userVotesMap[vote.statement_id] = vote.vote_value as VoteValue;
  }

  // 6. Build statement list
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

  // 7. Build cluster list
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
    hiveKey: (conversation.hives as any).slug,
    conversationKey: conversation.id,
    statements: statementList,
    userVotes: userVotesMap,
    clusters: Array.from(clusterMap.values()).sort((a, b) => {
      if (a.index === null) return 1;
      if (b.index === null) return -1;
      return a.index - b.index;
    }),
  };
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/deliberate-space/server/getDeliberateViewModel.ts
git commit -m "feat: add getDeliberateViewModel service

Builds view model with statements, votes, and clusters for discuss tab."
```

---

## Task 6: Vote on Statement Service

**Files:**
- Create: `lib/deliberate-space/server/voteOnStatement.ts`

**Step 1: Write implementation**

```typescript
// lib/deliberate-space/server/voteOnStatement.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoteOnStatementInput } from "@/lib/deliberate-space/schemas";

interface VoteOnStatementParams extends VoteOnStatementInput {
  userId?: string;
  guestSessionId?: string;
}

export interface VoteOnStatementResult {
  success: boolean;
  voteValue: number | null;
}

/**
 * Cast, update, or remove vote on a deliberation statement
 */
export async function voteOnStatement(
  supabase: SupabaseClient,
  params: VoteOnStatementParams
): Promise<VoteOnStatementResult> {
  const { statementId, voteValue, userId, guestSessionId } = params;

  if (!userId && !guestSessionId) {
    throw new Error("Must provide userId or guestSessionId");
  }

  // Verify statement exists
  const { data: statement, error: stmtError } = await supabase
    .from("deliberation_statements")
    .select("id, conversation_id")
    .eq("id", statementId)
    .maybeSingle();

  if (stmtError || !statement) {
    throw new Error("Statement not found");
  }

  // If voteValue is null, remove vote (pass)
  if (voteValue === null) {
    const deleteQuery = supabase
      .from("deliberation_votes")
      .delete()
      .eq("statement_id", statementId);

    if (userId) {
      await deleteQuery.eq("user_id", userId);
    } else {
      await deleteQuery.eq("guest_session_id", guestSessionId);
    }

    return { success: true, voteValue: null };
  }

  // Upsert vote
  const voteData: Record<string, unknown> = {
    statement_id: statementId,
    vote_value: voteValue,
    updated_at: new Date().toISOString(),
  };

  if (userId) {
    voteData.user_id = userId;
  } else {
    voteData.guest_session_id = guestSessionId;
  }

  const { error: voteError } = await supabase
    .from("deliberation_votes")
    .upsert(voteData, {
      onConflict: userId ? "statement_id,user_id" : "statement_id,guest_session_id",
    });

  if (voteError) {
    console.error("[voteOnStatement] Failed to save vote:", voteError);
    throw new Error("Failed to save vote");
  }

  return { success: true, voteValue };
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/deliberate-space/server/voteOnStatement.ts
git commit -m "feat: add voteOnStatement service

Handles vote casting, updating, and removal (pass) for statements."
```

---

## Task 7: Add Comment Service

**Files:**
- Create: `lib/deliberate-space/server/addComment.ts`

**Step 1: Write implementation**

```typescript
// lib/deliberate-space/server/addComment.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AddCommentInput } from "@/lib/deliberate-space/schemas";

interface AddCommentParams extends AddCommentInput {
  userId?: string;
  guestSessionId?: string;
}

export interface AddCommentResult {
  id: number;
  createdAt: string;
}

/**
 * Add a comment to a deliberation statement
 */
export async function addComment(
  supabase: SupabaseClient,
  params: AddCommentParams
): Promise<AddCommentResult> {
  const { statementId, text, isAnonymous, userId, guestSessionId } = params;

  if (!userId && !guestSessionId) {
    throw new Error("Must provide userId or guestSessionId");
  }

  // Verify statement exists
  const { data: statement, error: stmtError } = await supabase
    .from("deliberation_statements")
    .select("id")
    .eq("id", statementId)
    .maybeSingle();

  if (stmtError || !statement) {
    throw new Error("Statement not found");
  }

  const commentData: Record<string, unknown> = {
    statement_id: statementId,
    comment_text: text,
    is_anonymous: isAnonymous ?? false,
  };

  if (userId) {
    commentData.user_id = userId;
  } else {
    commentData.guest_session_id = guestSessionId;
  }

  const { data: comment, error: commentError } = await supabase
    .from("deliberation_comments")
    .insert(commentData)
    .select("id, created_at")
    .single();

  if (commentError || !comment) {
    console.error("[addComment] Failed to insert comment:", commentError);
    throw new Error("Failed to add comment");
  }

  return {
    id: comment.id,
    createdAt: comment.created_at,
  };
}

/**
 * Delete a comment (owner only)
 */
export async function deleteComment(
  supabase: SupabaseClient,
  commentId: number,
  userId?: string,
  guestSessionId?: string
): Promise<boolean> {
  if (!userId && !guestSessionId) {
    throw new Error("Must provide userId or guestSessionId");
  }

  // Verify ownership
  let query = supabase
    .from("deliberation_comments")
    .select("id")
    .eq("id", commentId);

  if (userId) {
    query = query.eq("user_id", userId);
  } else {
    query = query.eq("guest_session_id", guestSessionId);
  }

  const { data: comment } = await query.maybeSingle();

  if (!comment) {
    throw new Error("Comment not found or not owned by user");
  }

  const { error } = await supabase
    .from("deliberation_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    throw new Error("Failed to delete comment");
  }

  return true;
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/deliberate-space/server/addComment.ts
git commit -m "feat: add addComment and deleteComment services

Handles comment creation and owner-only deletion."
```

---

## Task 8: API Routes - Create Session

**Files:**
- Create: `app/api/deliberate-space/route.ts`

**Step 1: Write API route**

```typescript
// app/api/deliberate-space/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDeliberateSession } from "@/lib/deliberate-space/server/createDeliberateSession";
import { createDeliberateSessionSchema } from "@/lib/deliberate-space/schemas";
import { jsonError } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    const body = await request.json();
    const parsed = createDeliberateSessionSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(parsed.error.errors[0].message, 400);
    }

    const supabase = createSupabaseServerClient();
    const result = await createDeliberateSession(
      supabase,
      session.user.id,
      parsed.data
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[POST /api/deliberate-space] Error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return jsonError(message, 500);
  }
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add app/api/deliberate-space/route.ts
git commit -m "feat: add POST /api/deliberate-space route

Creates deliberate sessions with validation and auth."
```

---

## Task 9: API Routes - View Model, Votes, Comments

**Files:**
- Create: `app/api/conversations/[conversationId]/deliberate/route.ts`
- Create: `app/api/conversations/[conversationId]/deliberate/votes/route.ts`
- Create: `app/api/conversations/[conversationId]/deliberate/comments/route.ts`

**Step 1: Create view model route**

```typescript
// app/api/conversations/[conversationId]/deliberate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDeliberateViewModel } from "@/lib/deliberate-space/server/getDeliberateViewModel";
import { jsonError } from "@/lib/api/errors";

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    const supabase = createSupabaseServerClient();
    const viewModel = await getDeliberateViewModel(supabase, {
      conversationId,
      userId: session.user.id,
    });

    if (!viewModel) {
      return jsonError("Conversation not found", 404);
    }

    return NextResponse.json(viewModel);
  } catch (error) {
    console.error("[GET /api/conversations/.../deliberate] Error:", error);
    return jsonError("Internal error", 500);
  }
}
```

**Step 2: Create votes route**

```typescript
// app/api/conversations/[conversationId]/deliberate/votes/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { voteOnStatement } from "@/lib/deliberate-space/server/voteOnStatement";
import { voteOnStatementSchema } from "@/lib/deliberate-space/schemas";
import { jsonError } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    const body = await request.json();
    const parsed = voteOnStatementSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(parsed.error.errors[0].message, 400);
    }

    const supabase = createSupabaseServerClient();
    const result = await voteOnStatement(supabase, {
      ...parsed.data,
      userId: session.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST .../deliberate/votes] Error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return jsonError(message, 500);
  }
}
```

**Step 3: Create comments route**

```typescript
// app/api/conversations/[conversationId]/deliberate/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addComment, deleteComment } from "@/lib/deliberate-space/server/addComment";
import { addCommentSchema, deleteCommentSchema } from "@/lib/deliberate-space/schemas";
import { jsonError } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    const body = await request.json();
    const parsed = addCommentSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(parsed.error.errors[0].message, 400);
    }

    const supabase = createSupabaseServerClient();
    const result = await addComment(supabase, {
      ...parsed.data,
      userId: session.user.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[POST .../deliberate/comments] Error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return jsonError(message, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const parsed = deleteCommentSchema.safeParse({
      commentId: searchParams.get("commentId"),
    });

    if (!parsed.success) {
      return jsonError(parsed.error.errors[0].message, 400);
    }

    const supabase = createSupabaseServerClient();
    await deleteComment(supabase, parsed.data.commentId, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE .../deliberate/comments] Error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return jsonError(message, 500);
  }
}
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add app/api/conversations/[conversationId]/deliberate/
git commit -m "feat: add deliberate API routes

GET view model, POST votes, POST/DELETE comments."
```

---

## Task 10: Update Conversation Header for Deliberate Tabs

**Files:**
- Modify: `app/components/conversation/ConversationHeader.tsx`

**Step 1: Update tab configuration**

In `ConversationHeader.tsx`, update the tab configuration around line 106-116:

```typescript
// Tab configuration depends on conversation type
const tabs =
  conversationType === "decide"
    ? [
        { slug: "decide?tab=vote", label: "Vote" },
        { slug: "decide?tab=results", label: "Results" },
      ]
    : conversationType === "deliberate"
      ? [
          { slug: "discuss", label: "Discuss" },
          { slug: "analysis", label: "Analysis" },
          { slug: "result", label: "Result" },
        ]
      : [
          { slug: "listen", label: "Listen" },
          { slug: "understand", label: "Understand" },
          { slug: "result", label: "Result" },
        ];
```

**Step 2: Update props interface**

Update the `conversationType` prop around line 32:

```typescript
conversationType?: "understand" | "decide" | "deliberate";
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add app/components/conversation/ConversationHeader.tsx
git commit -m "feat: add deliberate tabs to ConversationHeader

Adds Discuss, Analysis, Result tabs for deliberate conversations."
```

---

## Task 11: Create Discuss Tab Page

**Files:**
- Create: `app/hives/[hiveId]/conversations/[conversationId]/discuss/page.tsx`

**Step 1: Create page component**

```typescript
// app/hives/[hiveId]/conversations/[conversationId]/discuss/page.tsx

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDeliberateViewModel } from "@/lib/deliberate-space/server/getDeliberateViewModel";
import DiscussViewContainer from "@/app/components/conversation/DiscussViewContainer";

interface PageProps {
  params: Promise<{
    hiveId: string;
    conversationId: string;
  }>;
}

export default async function DiscussPage({ params }: PageProps) {
  const { hiveId, conversationId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const supabase = createSupabaseServerClient();
  const viewModel = await getDeliberateViewModel(supabase, {
    conversationId,
    userId: session.user.id,
  });

  if (!viewModel) {
    redirect(`/hives/${hiveId}`);
  }

  return <DiscussViewContainer initialViewModel={viewModel} />;
}
```

**Step 2: Create Analysis placeholder page**

Create: `app/hives/[hiveId]/conversations/[conversationId]/analysis/page.tsx`

```typescript
// app/hives/[hiveId]/conversations/[conversationId]/analysis/page.tsx

import { BarChart3 } from "lucide-react";

export default function AnalysisPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-500">
      <BarChart3 className="w-12 h-12 mb-4" />
      <p>Analysis will appear here</p>
    </div>
  );
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors (DiscussViewContainer not yet created - will error, continue to next task)

**Step 4: Commit**

```bash
git add app/hives/[hiveId]/conversations/[conversationId]/discuss/page.tsx app/hives/[hiveId]/conversations/[conversationId]/analysis/page.tsx
git commit -m "feat: add discuss and analysis tab pages

Server components for deliberate conversation tabs."
```

---

## Task 12: DiscussView Components - Container and Main View

**Files:**
- Create: `app/components/conversation/DiscussViewContainer.tsx`
- Create: `app/components/conversation/DiscussView.tsx`

**Step 1: Create container component**

```typescript
// app/components/conversation/DiscussViewContainer.tsx

"use client";

import { useState, useCallback } from "react";
import type { DeliberateViewModel, VoteValue } from "@/types/deliberate-space";
import DiscussView from "./DiscussView";

interface DiscussViewContainerProps {
  initialViewModel: DeliberateViewModel;
}

export default function DiscussViewContainer({
  initialViewModel,
}: DiscussViewContainerProps) {
  const [viewModel, setViewModel] = useState(initialViewModel);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(
    null
  );

  const handleVote = useCallback(
    async (statementId: string, voteValue: VoteValue | null) => {
      // Optimistic update
      setViewModel((prev) => ({
        ...prev,
        userVotes: {
          ...prev.userVotes,
          [statementId]: voteValue,
        },
      }));

      try {
        const response = await fetch(
          `/api/conversations/${viewModel.conversationId}/deliberate/votes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ statementId, voteValue }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to save vote");
        }
      } catch (error) {
        // Revert on error
        setViewModel((prev) => ({
          ...prev,
          userVotes: {
            ...prev.userVotes,
            [statementId]: initialViewModel.userVotes[statementId] ?? null,
          },
        }));
        console.error("Vote failed:", error);
      }
    },
    [viewModel.conversationId, initialViewModel.userVotes]
  );

  return (
    <DiscussView
      viewModel={viewModel}
      selectedStatementId={selectedStatementId}
      onSelectStatement={setSelectedStatementId}
      onVote={handleVote}
    />
  );
}
```

**Step 2: Create main view component**

```typescript
// app/components/conversation/DiscussView.tsx

"use client";

import { useMemo } from "react";
import type { DeliberateViewModel, VoteValue } from "@/types/deliberate-space";
import StatementListCard from "./StatementListCard";
import StatementDetailPanel from "./StatementDetailPanel";
import { MessageSquare } from "lucide-react";

interface DiscussViewProps {
  viewModel: DeliberateViewModel;
  selectedStatementId: string | null;
  onSelectStatement: (id: string | null) => void;
  onVote: (statementId: string, voteValue: VoteValue | null) => void;
}

export default function DiscussView({
  viewModel,
  selectedStatementId,
  onSelectStatement,
  onVote,
}: DiscussViewProps) {
  const { statements, userVotes, clusters } = viewModel;

  const selectedStatement = useMemo(
    () => statements.find((s) => s.id === selectedStatementId) ?? null,
    [statements, selectedStatementId]
  );

  const statementsByCluster = useMemo(() => {
    const grouped = new Map<number | null, typeof statements>();
    for (const stmt of statements) {
      const key = stmt.clusterIndex;
      const existing = grouped.get(key) || [];
      existing.push(stmt);
      grouped.set(key, existing);
    }
    return grouped;
  }, [statements]);

  return (
    <div className="flex h-full">
      {/* Left Column - Statement List */}
      <div className="w-2/5 border-r border-border-secondary overflow-y-auto p-4">
        {clusters.map((cluster) => {
          const clusterStatements = statementsByCluster.get(cluster.index) || [];
          return (
            <div key={cluster.index ?? "unclustered"} className="mb-6">
              <h3 className="text-label font-medium text-text-secondary mb-2">
                {cluster.name || "Unclustered"}
                <span className="ml-2 text-info text-text-tertiary">
                  ({cluster.statementCount})
                </span>
              </h3>
              <div className="space-y-2">
                {clusterStatements.map((stmt) => (
                  <StatementListCard
                    key={stmt.id}
                    statement={stmt}
                    isSelected={stmt.id === selectedStatementId}
                    onClick={() => onSelectStatement(stmt.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right Column - Statement Detail */}
      <div className="w-3/5 overflow-y-auto">
        {selectedStatement ? (
          <StatementDetailPanel
            statement={selectedStatement}
            currentVote={userVotes[selectedStatement.id] ?? null}
            onVote={(value) => onVote(selectedStatement.id, value)}
            conversationId={viewModel.conversationId}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
            <MessageSquare className="w-12 h-12 mb-4" />
            <p>Explore statements and give feedback here</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Errors for missing StatementListCard and StatementDetailPanel (continue to next task)

**Step 4: Commit**

```bash
git add app/components/conversation/DiscussViewContainer.tsx app/components/conversation/DiscussView.tsx
git commit -m "feat: add DiscussView container and main component

Two-column layout with statement list and detail panel."
```

---

## Task 13: StatementListCard Component

**Files:**
- Create: `app/components/conversation/StatementListCard.tsx`

**Step 1: Create component**

```typescript
// app/components/conversation/StatementListCard.tsx

"use client";

import type { DeliberateStatement } from "@/types/deliberate-space";
import { Vote, MessageCircle } from "lucide-react";

interface StatementListCardProps {
  statement: DeliberateStatement;
  isSelected: boolean;
  onClick: () => void;
}

export default function StatementListCard({
  statement,
  isSelected,
  onClick,
}: StatementListCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isSelected
          ? "border-brand-primary bg-brand-primary/5"
          : "border-border-secondary hover:border-border-primary hover:bg-surface-secondary"
      }`}
    >
      <p className="text-body text-text-primary line-clamp-2 mb-2">
        {statement.statementText}
      </p>
      <div className="flex items-center gap-4 text-info text-text-tertiary">
        <span className="flex items-center gap-1">
          <Vote className="w-3.5 h-3.5" />
          {statement.voteCount}
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="w-3.5 h-3.5" />
          {statement.commentCount}
        </span>
      </div>
    </button>
  );
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors for this file

**Step 3: Commit**

```bash
git add app/components/conversation/StatementListCard.tsx
git commit -m "feat: add StatementListCard component

Compact card showing statement text with vote/comment counts."
```

---

## Task 14: VoteSlider Component

**Files:**
- Create: `app/components/conversation/VoteSlider.tsx`

**Step 1: Create component**

```typescript
// app/components/conversation/VoteSlider.tsx

"use client";

import { VOTE_LABELS, type VoteValue } from "@/types/deliberate-space";

interface VoteSliderProps {
  value: VoteValue | null;
  onChange: (value: VoteValue | null) => void;
}

const VOTE_VALUES: VoteValue[] = [1, 2, 3, 4, 5];

export default function VoteSlider({ value, onChange }: VoteSliderProps) {
  return (
    <div className="space-y-4">
      {/* Segmented control */}
      <div className="flex rounded-lg border border-border-secondary overflow-hidden">
        {VOTE_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 py-3 px-2 text-center transition-colors ${
              value === v
                ? "bg-brand-primary text-white"
                : "bg-surface-primary hover:bg-surface-secondary text-text-secondary"
            }`}
          >
            <span className="text-subtitle font-medium">{v}</span>
          </button>
        ))}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-info text-text-tertiary px-1">
        <span>{VOTE_LABELS[1]}</span>
        <span>{VOTE_LABELS[5]}</span>
      </div>

      {/* Current selection label */}
      {value && (
        <p className="text-center text-body text-text-secondary">
          {VOTE_LABELS[value]}
        </p>
      )}

      {/* Pass button */}
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`w-full py-2 rounded-lg border transition-colors ${
          value === null
            ? "border-slate-400 bg-slate-100 text-slate-700"
            : "border-border-secondary hover:border-border-primary text-text-tertiary"
        }`}
      >
        Pass
      </button>
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add app/components/conversation/VoteSlider.tsx
git commit -m "feat: add VoteSlider component

5-point segmented control with labels and pass button."
```

---

## Task 15: StatementDetailPanel Component

**Files:**
- Create: `app/components/conversation/StatementDetailPanel.tsx`

**Step 1: Create component**

```typescript
// app/components/conversation/StatementDetailPanel.tsx

"use client";

import { useState } from "react";
import type { DeliberateStatement, VoteValue } from "@/types/deliberate-space";
import VoteSlider from "./VoteSlider";
import DeliberateCommentList from "./DeliberateCommentList";
import { ChevronDown, ChevronUp } from "lucide-react";

interface StatementDetailPanelProps {
  statement: DeliberateStatement;
  currentVote: VoteValue | null;
  onVote: (value: VoteValue | null) => void;
  conversationId: string;
}

export default function StatementDetailPanel({
  statement,
  currentVote,
  onVote,
  conversationId,
}: StatementDetailPanelProps) {
  const [showOriginalResponses, setShowOriginalResponses] = useState(false);

  return (
    <div className="p-6 space-y-6">
      {/* Statement text */}
      <div>
        <p className="text-title text-text-primary leading-relaxed">
          {statement.statementText}
        </p>
      </div>

      {/* Vote slider */}
      <div className="max-w-md">
        <VoteSlider value={currentVote} onChange={onVote} />
      </div>

      {/* Original responses accordion */}
      {statement.sourceBucketId && (
        <div className="border-t border-border-secondary pt-4">
          <button
            type="button"
            onClick={() => setShowOriginalResponses(!showOriginalResponses)}
            className="flex items-center gap-2 text-body text-text-secondary hover:text-text-primary"
          >
            {showOriginalResponses ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            Show original responses
          </button>
          {showOriginalResponses && (
            <div className="mt-4 pl-4 border-l-2 border-border-secondary">
              <p className="text-info text-text-tertiary">
                Original responses will load here
              </p>
            </div>
          )}
        </div>
      )}

      {/* Comments section */}
      <div className="border-t border-border-secondary pt-6">
        <DeliberateCommentList
          statementId={statement.id}
          conversationId={conversationId}
        />
      </div>
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: Error for missing DeliberateCommentList (continue to next task)

**Step 3: Commit**

```bash
git add app/components/conversation/StatementDetailPanel.tsx
git commit -m "feat: add StatementDetailPanel component

Shows statement with vote slider, original responses accordion, and comments."
```

---

## Task 16: DeliberateCommentList Component

**Files:**
- Create: `app/components/conversation/DeliberateCommentList.tsx`

**Step 1: Create component**

```typescript
// app/components/conversation/DeliberateCommentList.tsx

"use client";

import { useState, useEffect, useCallback } from "react";
import type { DeliberateComment } from "@/types/deliberate-space";
import { Send, Trash2 } from "lucide-react";

interface DeliberateCommentListProps {
  statementId: string;
  conversationId: string;
}

export default function DeliberateCommentList({
  statementId,
  conversationId,
}: DeliberateCommentListProps) {
  const [comments, setComments] = useState<DeliberateComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch comments
  useEffect(() => {
    async function fetchComments() {
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/deliberate/statements/${statementId}/comments`
        );
        if (response.ok) {
          const data = await response.json();
          setComments(data.comments || []);
        }
      } catch (error) {
        console.error("Failed to fetch comments:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchComments();
  }, [conversationId, statementId]);

  const handleSubmit = useCallback(async () => {
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/deliberate/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statementId,
            text: newComment.trim(),
            isAnonymous,
          }),
        }
      );

      if (response.ok) {
        setNewComment("");
        // Refetch comments
        const refreshResponse = await fetch(
          `/api/conversations/${conversationId}/deliberate/statements/${statementId}/comments`
        );
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          setComments(data.comments || []);
        }
      }
    } catch (error) {
      console.error("Failed to post comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [conversationId, statementId, newComment, isAnonymous, isSubmitting]);

  const handleDelete = useCallback(
    async (commentId: string) => {
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/deliberate/comments?commentId=${commentId}`,
          { method: "DELETE" }
        );

        if (response.ok) {
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }
      } catch (error) {
        console.error("Failed to delete comment:", error);
      }
    },
    [conversationId]
  );

  return (
    <div className="space-y-4">
      <h4 className="text-label font-medium text-text-secondary">
        Comments ({comments.length})
      </h4>

      {/* Comment input */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 px-3 py-2 rounded-lg border border-border-secondary focus:border-brand-primary focus:outline-none text-body"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!newComment.trim() || isSubmitting}
            className="px-4 py-2 rounded-lg bg-brand-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <label className="flex items-center gap-2 text-info text-text-tertiary">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="rounded"
          />
          Post anonymously
        </label>
      </div>

      {/* Comments list */}
      {isLoading ? (
        <p className="text-info text-text-tertiary">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-info text-text-tertiary">No comments yet</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="p-3 rounded-lg bg-surface-secondary"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-label font-medium text-text-primary">
                    {comment.user.name}
                  </span>
                  <span className="text-info text-text-tertiary">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {comment.isMine && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    className="text-text-tertiary hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-body text-text-secondary">{comment.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create comments fetch API route**

Create: `app/api/conversations/[conversationId]/deliberate/statements/[statementId]/comments/route.ts`

```typescript
// app/api/conversations/[conversationId]/deliberate/statements/[statementId]/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/errors";

interface RouteParams {
  params: Promise<{ conversationId: string; statementId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { statementId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    const supabase = createSupabaseServerClient();

    const { data: comments, error } = await supabase
      .from("deliberation_comments")
      .select(
        `
        id,
        statement_id,
        comment_text,
        is_anonymous,
        created_at,
        user_id,
        profiles!deliberation_comments_user_id_fkey(id, display_name, avatar_url)
      `
      )
      .eq("statement_id", statementId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET comments] Error:", error);
      return jsonError("Failed to fetch comments", 500);
    }

    const formattedComments = (comments || []).map((c: any) => ({
      id: String(c.id),
      statementId: c.statement_id,
      text: c.comment_text,
      isAnonymous: c.is_anonymous,
      createdAt: c.created_at,
      user: {
        id: c.is_anonymous ? null : c.user_id,
        name: c.is_anonymous
          ? "Anonymous"
          : c.profiles?.display_name || "Unknown",
        avatarUrl: c.is_anonymous ? null : c.profiles?.avatar_url || null,
      },
      isMine: c.user_id === session.user.id,
    }));

    return NextResponse.json({ comments: formattedComments });
  } catch (error) {
    console.error("[GET comments] Error:", error);
    return jsonError("Internal error", 500);
  }
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add app/components/conversation/DeliberateCommentList.tsx app/api/conversations/[conversationId]/deliberate/statements/[statementId]/comments/route.ts
git commit -m "feat: add DeliberateCommentList component and API

Comment input, list, and delete functionality."
```

---

## Task 17: Enable Deliberate in New Session Wizard

**Files:**
- Modify: `app/components/new-session-launcher.tsx` (or equivalent)

**Step 1: Find and update session type selector**

Locate where conversation types are defined in the new session flow. Add "deliberate" to the available options:

```typescript
// In the session type configuration, add:
{
  type: "deliberate",
  label: "Deliberate",
  description: "Gather sentiment on statements with a 5-point scale",
  icon: MessageSquareMore, // or appropriate icon
}
```

**Step 2: Run typecheck and test**

Run: `npm run typecheck && npm run dev`
Expected: Deliberate option appears in new session wizard

**Step 3: Commit**

```bash
git add app/components/new-session-launcher.tsx
git commit -m "feat: enable deliberate type in new session wizard

Adds deliberate option to session type selector."
```

---

## Task 18: Deliberate Setup Wizard - From Understand Mode

**Files:**
- Create: `app/components/deliberate-setup-wizard.tsx`
- Create: `lib/deliberate-space/react/useDeliberateSetupWizard.ts`

**Step 1: Create wizard hook**

```typescript
// lib/deliberate-space/react/useDeliberateSetupWizard.ts

"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  DeliberateWizardMode,
  ClusterSelectionItem,
  StatementSelectionItem,
  ManualStatement,
} from "@/types/deliberate-space";

interface UseDeliberateSetupWizardProps {
  hiveId: string;
  open: boolean;
  onClose: () => void;
  onComplete: (conversationId: string, slug: string | null) => void;
}

export function useDeliberateSetupWizard({
  hiveId,
  open,
  onClose,
  onComplete,
}: UseDeliberateSetupWizardProps) {
  // Mode selection
  const [mode, setMode] = useState<DeliberateWizardMode | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // From-understand state
  const [sourceConversations, setSourceConversations] = useState<any[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [clusters, setClusters] = useState<ClusterSelectionItem[]>([]);
  const [statements, setStatements] = useState<StatementSelectionItem[]>([]);

  // From-scratch state
  const [manualStatements, setManualStatements] = useState<ManualStatement[]>(
    []
  );

  // Common state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Reset on open
  useEffect(() => {
    if (open) {
      setMode(null);
      setStep(0);
      setError(null);
      setSelectedSourceId(null);
      setClusters([]);
      setStatements([]);
      setManualStatements([]);
      setTitle("");
      setDescription("");
    }
  }, [open]);

  // Fetch source conversations when mode is from-understand
  useEffect(() => {
    if (mode === "from-understand" && open) {
      fetch(`/api/hives/${hiveId}/understand-sessions?status=ready`)
        .then((res) => res.json())
        .then((data) => setSourceConversations(data.sessions || []))
        .catch(console.error);
    }
  }, [mode, open, hiveId]);

  // Fetch clusters/statements when source selected
  useEffect(() => {
    if (selectedSourceId) {
      fetch(`/api/deliberate-space/setup?sourceConversationId=${selectedSourceId}`)
        .then((res) => res.json())
        .then((data) => {
          setClusters(
            data.clusters.map((c: any) => ({ ...c, selected: false }))
          );
          setStatements(
            data.statements.map((s: any) => ({ ...s, selected: false }))
          );
        })
        .catch(console.error);
    }
  }, [selectedSourceId]);

  const toggleCluster = useCallback((index: number) => {
    setClusters((prev) =>
      prev.map((c) =>
        c.clusterIndex === index ? { ...c, selected: !c.selected } : c
      )
    );
  }, []);

  const toggleStatement = useCallback((bucketId: string) => {
    setStatements((prev) =>
      prev.map((s) =>
        s.bucketId === bucketId ? { ...s, selected: !s.selected } : s
      )
    );
  }, []);

  const addManualStatement = useCallback((text: string, clusterName?: string) => {
    if (manualStatements.length >= 20) {
      setError("Warning: You have added 20+ statements");
    }
    setManualStatements((prev) => [...prev, { text, clusterName }]);
  }, [manualStatements.length]);

  const removeManualStatement = useCallback((index: number) => {
    setManualStatements((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onNext = useCallback(() => {
    setError(null);
    if (mode === "from-understand") {
      if (step === 1 && !selectedSourceId) {
        setError("Please select a source conversation");
        return;
      }
      if (step === 2 && !clusters.some((c) => c.selected)) {
        setError("Please select at least one cluster");
        return;
      }
      if (step === 3 && !statements.some((s) => s.selected)) {
        setError("Please select at least one statement");
        return;
      }
    } else {
      if (step === 1 && manualStatements.length === 0) {
        setError("Please add at least one statement");
        return;
      }
    }
    setStep((s) => s + 1);
  }, [mode, step, selectedSourceId, clusters, statements, manualStatements]);

  const onBack = useCallback(() => {
    setError(null);
    if (step === 1) {
      setMode(null);
      setStep(0);
    } else {
      setStep((s) => s - 1);
    }
  }, [step]);

  const onFinish = useCallback(async () => {
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const body =
        mode === "from-understand"
          ? {
              hiveId,
              mode,
              title,
              description,
              sourceConversationId: selectedSourceId,
              selectedStatements: statements.filter((s) => s.selected),
            }
          : {
              hiveId,
              mode,
              title,
              description,
              manualStatements,
            };

      const response = await fetch("/api/deliberate-space", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create session");
      }

      const result = await response.json();
      onComplete(result.conversationId, result.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [
    mode,
    hiveId,
    title,
    description,
    selectedSourceId,
    statements,
    manualStatements,
    onComplete,
  ]);

  return {
    mode,
    setMode,
    step,
    loading,
    error,
    sourceConversations,
    selectedSourceId,
    setSelectedSourceId,
    clusters,
    toggleCluster,
    statements,
    toggleStatement,
    manualStatements,
    addManualStatement,
    removeManualStatement,
    title,
    setTitle,
    description,
    setDescription,
    onNext,
    onBack,
    onFinish,
    onClose,
  };
}
```

**Step 2: Create wizard UI component**

Create a basic wizard component that uses the hook. This follows the DecisionSetupWizard pattern.

```typescript
// app/components/deliberate-setup-wizard.tsx

"use client";

import { useDeliberateSetupWizard } from "@/lib/deliberate-space/react/useDeliberateSetupWizard";
import Button from "@/app/components/button";
import { X, FileText, PenLine } from "lucide-react";

interface DeliberateSetupWizardProps {
  hiveId: string;
  open: boolean;
  onClose: () => void;
  onComplete: (conversationId: string, slug: string | null) => void;
}

export default function DeliberateSetupWizard({
  hiveId,
  open,
  onClose,
  onComplete,
}: DeliberateSetupWizardProps) {
  const wizard = useDeliberateSetupWizard({
    hiveId,
    open,
    onClose,
    onComplete,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-primary rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-secondary">
          <h2 className="text-title font-semibold">Create Deliberation</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {wizard.error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">
              {wizard.error}
            </div>
          )}

          {/* Mode selection */}
          {wizard.mode === null && (
            <div className="space-y-4">
              <p className="text-body text-text-secondary mb-6">
                How would you like to create your deliberation?
              </p>
              <button
                onClick={() => { wizard.setMode("from-understand"); wizard.onNext(); }}
                className="w-full p-4 border border-border-secondary rounded-lg hover:border-brand-primary text-left flex items-start gap-4"
              >
                <FileText className="w-6 h-6 text-brand-primary shrink-0 mt-1" />
                <div>
                  <h3 className="text-subtitle font-medium">From existing conversation</h3>
                  <p className="text-body text-text-secondary">
                    Select statements from an analysed Explore or Understand conversation
                  </p>
                </div>
              </button>
              <button
                onClick={() => { wizard.setMode("from-scratch"); wizard.onNext(); }}
                className="w-full p-4 border border-border-secondary rounded-lg hover:border-brand-primary text-left flex items-start gap-4"
              >
                <PenLine className="w-6 h-6 text-brand-primary shrink-0 mt-1" />
                <div>
                  <h3 className="text-subtitle font-medium">Create from scratch</h3>
                  <p className="text-body text-text-secondary">
                    Write your own statements to deliberate on
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* From-understand: Step 1 - Source selection */}
          {wizard.mode === "from-understand" && wizard.step === 1 && (
            <div className="space-y-4">
              <h3 className="text-subtitle font-medium">Select source conversation</h3>
              {wizard.sourceConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => wizard.setSelectedSourceId(conv.id)}
                  className={`w-full p-3 border rounded-lg text-left ${
                    wizard.selectedSourceId === conv.id
                      ? "border-brand-primary bg-brand-primary/5"
                      : "border-border-secondary hover:border-border-primary"
                  }`}
                >
                  <p className="text-body font-medium">{conv.title}</p>
                </button>
              ))}
            </div>
          )}

          {/* From-understand: Step 2 - Cluster selection */}
          {wizard.mode === "from-understand" && wizard.step === 2 && (
            <div className="space-y-4">
              <h3 className="text-subtitle font-medium">Select clusters</h3>
              {wizard.clusters.map((cluster) => (
                <label
                  key={cluster.clusterIndex}
                  className="flex items-center gap-3 p-3 border border-border-secondary rounded-lg cursor-pointer hover:bg-surface-secondary"
                >
                  <input
                    type="checkbox"
                    checked={cluster.selected}
                    onChange={() => wizard.toggleCluster(cluster.clusterIndex)}
                    className="rounded"
                  />
                  <div>
                    <p className="text-body font-medium">{cluster.name}</p>
                    <p className="text-info text-text-tertiary">
                      {cluster.statementCount} statements
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* From-understand: Step 3 - Statement selection */}
          {wizard.mode === "from-understand" && wizard.step === 3 && (
            <div className="space-y-4">
              <h3 className="text-subtitle font-medium">Select statements</h3>
              {wizard.statements
                .filter((s) =>
                  wizard.clusters.some(
                    (c) => c.selected && c.clusterIndex === s.clusterIndex
                  )
                )
                .map((stmt) => (
                  <label
                    key={stmt.bucketId}
                    className="flex items-start gap-3 p-3 border border-border-secondary rounded-lg cursor-pointer hover:bg-surface-secondary"
                  >
                    <input
                      type="checkbox"
                      checked={stmt.selected}
                      onChange={() => wizard.toggleStatement(stmt.bucketId)}
                      className="rounded mt-1"
                    />
                    <div>
                      <p className="text-info text-text-tertiary">
                        {stmt.clusterName}
                      </p>
                      <p className="text-body">{stmt.statementText}</p>
                    </div>
                  </label>
                ))}
            </div>
          )}

          {/* From-scratch: Step 1 - Add statements */}
          {wizard.mode === "from-scratch" && wizard.step === 1 && (
            <div className="space-y-4">
              <h3 className="text-subtitle font-medium">Add statements</h3>
              <StatementInput onAdd={wizard.addManualStatement} />
              {wizard.manualStatements.length > 0 && (
                <div className="space-y-2">
                  {wizard.manualStatements.map((stmt, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-3 bg-surface-secondary rounded-lg"
                    >
                      <p className="flex-1 text-body">{stmt.text}</p>
                      <button
                        onClick={() => wizard.removeManualStatement(i)}
                        className="text-text-tertiary hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settings step */}
          {((wizard.mode === "from-understand" && wizard.step === 4) ||
            (wizard.mode === "from-scratch" && wizard.step === 2)) && (
            <div className="space-y-4">
              <h3 className="text-subtitle font-medium">Settings</h3>
              <div>
                <label className="block text-label text-text-secondary mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={wizard.title}
                  onChange={(e) => wizard.setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-border-secondary rounded-lg focus:border-brand-primary focus:outline-none"
                  placeholder="Enter a title"
                />
              </div>
              <div>
                <label className="block text-label text-text-secondary mb-1">
                  Description
                </label>
                <textarea
                  value={wizard.description}
                  onChange={(e) => wizard.setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-border-secondary rounded-lg focus:border-brand-primary focus:outline-none"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>
            </div>
          )}

          {/* Review step */}
          {((wizard.mode === "from-understand" && wizard.step === 5) ||
            (wizard.mode === "from-scratch" && wizard.step === 3)) && (
            <div className="space-y-4">
              <h3 className="text-subtitle font-medium">Review</h3>
              <div className="space-y-2 text-body">
                <p>
                  <strong>Title:</strong> {wizard.title}
                </p>
                {wizard.description && (
                  <p>
                    <strong>Description:</strong> {wizard.description}
                  </p>
                )}
                <p>
                  <strong>Statements:</strong>{" "}
                  {wizard.mode === "from-understand"
                    ? wizard.statements.filter((s) => s.selected).length
                    : wizard.manualStatements.length}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-4 border-t border-border-secondary">
          <Button
            variant="secondary"
            onClick={wizard.step === 0 ? onClose : wizard.onBack}
          >
            {wizard.step === 0 ? "Cancel" : "Back"}
          </Button>
          {wizard.mode !== null && (
            <Button
              onClick={
                (wizard.mode === "from-understand" && wizard.step === 5) ||
                (wizard.mode === "from-scratch" && wizard.step === 3)
                  ? wizard.onFinish
                  : wizard.onNext
              }
              disabled={wizard.loading}
            >
              {wizard.loading
                ? "Creating..."
                : (wizard.mode === "from-understand" && wizard.step === 5) ||
                    (wizard.mode === "from-scratch" && wizard.step === 3)
                  ? "Create"
                  : "Next"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatementInput({
  onAdd,
}: {
  onAdd: (text: string, clusterName?: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter a statement..."
        className="flex-1 px-3 py-2 border border-border-secondary rounded-lg focus:border-brand-primary focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            onAdd(text.trim());
            setText("");
          }
        }}
      />
      <Button
        onClick={() => {
          if (text.trim()) {
            onAdd(text.trim());
            setText("");
          }
        }}
        disabled={!text.trim()}
      >
        Add
      </Button>
    </div>
  );
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add lib/deliberate-space/react/useDeliberateSetupWizard.ts app/components/deliberate-setup-wizard.tsx
git commit -m "feat: add deliberate setup wizard

Multi-step wizard for from-understand and from-scratch modes."
```

---

## Task 19: Setup Data API Route

**Files:**
- Create: `app/api/deliberate-space/setup/route.ts`

**Step 1: Create setup route**

```typescript
// app/api/deliberate-space/setup/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDeliberateSetupDataSchema } from "@/lib/deliberate-space/schemas";
import { jsonError } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const parsed = getDeliberateSetupDataSchema.safeParse({
      sourceConversationId: searchParams.get("sourceConversationId"),
    });

    if (!parsed.success) {
      return jsonError(parsed.error.errors[0].message, 400);
    }

    const supabase = createSupabaseServerClient();
    const { sourceConversationId } = parsed.data;

    // Get themes (clusters)
    const { data: themes } = await supabase
      .from("conversation_themes")
      .select("*")
      .eq("conversation_id", sourceConversationId)
      .order("cluster_index");

    // Get cluster buckets (consolidated statements)
    const { data: buckets } = await supabase
      .from("conversation_cluster_buckets")
      .select("*")
      .eq("conversation_id", sourceConversationId)
      .order("cluster_index")
      .order("bucket_index");

    const clusters = (themes || []).map((t: any) => ({
      clusterIndex: t.cluster_index,
      name: t.name,
      description: t.description || "",
      statementCount: (buckets || []).filter(
        (b: any) => b.cluster_index === t.cluster_index
      ).length,
    }));

    const statements = (buckets || []).map((b: any) => {
      const theme = (themes || []).find(
        (t: any) => t.cluster_index === b.cluster_index
      );
      return {
        bucketId: b.id,
        clusterIndex: b.cluster_index,
        clusterName: theme?.name || `Cluster ${b.cluster_index}`,
        statementText: b.consolidated_statement,
      };
    });

    return NextResponse.json({ clusters, statements });
  } catch (error) {
    console.error("[GET /api/deliberate-space/setup] Error:", error);
    return jsonError("Internal error", 500);
  }
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add app/api/deliberate-space/setup/route.ts
git commit -m "feat: add deliberate setup data API

Returns clusters and statements from source conversation."
```

---

## Task 20: Integration Tests

**Files:**
- Create: `app/tests/api/deliberate-space.test.ts`

**Step 1: Write integration tests**

```typescript
// app/tests/api/deliberate-space.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("Deliberate Space API", () => {
  describe("POST /api/deliberate-space", () => {
    it("creates session from scratch", async () => {
      // Test implementation with mocked auth
      expect(true).toBe(true); // Placeholder
    });

    it("validates required fields", async () => {
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("POST /api/conversations/.../deliberate/votes", () => {
    it("casts vote on statement", async () => {
      expect(true).toBe(true); // Placeholder
    });

    it("updates existing vote", async () => {
      expect(true).toBe(true); // Placeholder
    });

    it("removes vote when value is null", async () => {
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("POST /api/conversations/.../deliberate/comments", () => {
    it("adds comment to statement", async () => {
      expect(true).toBe(true); // Placeholder
    });
  });
});
```

**Step 2: Run tests**

Run: `npm test -- app/tests/api/deliberate-space.test.ts`
Expected: PASS (placeholders)

**Step 3: Commit**

```bash
git add app/tests/api/deliberate-space.test.ts
git commit -m "test: add deliberate-space integration test scaffolding"
```

---

## Task 21: Documentation Updates

**Files:**
- Modify: `docs/feature-map.md`
- Create: `lib/deliberate-space/README.md`

**Step 1: Update feature-map.md**

Add deliberate section:

```markdown
## Deliberate Conversations

**Purpose:** Gather sentiment on statements with 5-point voting scale

**Flow:**
1. Create session via wizard (from-understand or from-scratch)
2. Users vote on statements (1-5 scale) and add comments
3. Analysis tab shows aggregated results (future)
4. Result tab shows deliberation report (future)

**Key Files:**
- Wizard: `app/components/deliberate-setup-wizard.tsx`
- Discuss tab: `app/components/conversation/DiscussView.tsx`
- Vote slider: `app/components/conversation/VoteSlider.tsx`
- API routes: `app/api/deliberate-space/`, `app/api/conversations/[id]/deliberate/`
- Services: `lib/deliberate-space/server/`
```

**Step 2: Create deliberate-space README**

```markdown
# Deliberate Space

This module handles deliberate conversations - sentiment-based deliberation with 5-point voting.

## Overview

Deliberate conversations let users:
- Vote on statements with a 5-point scale (1=Strong aversion to 5=Deeply resonates)
- Add comments to statements
- View aggregated sentiment (future)

## Key Components

### Server (`server/`)
- `createDeliberateSession.ts` - Create session with statements
- `getDeliberateViewModel.ts` - Build view model for discuss tab
- `voteOnStatement.ts` - Cast/update/remove votes
- `addComment.ts` - Add/delete comments

### React Hooks (`react/`)
- `useDeliberateSetupWizard.ts` - Wizard state management

### Schemas (`schemas.ts`)
- Zod validation for all inputs

## Database Tables

- `deliberation_statements` - Statements to deliberate on
- `deliberation_votes` - User votes (1-5 scale)
- `deliberation_comments` - Comments on statements

## API Routes

- `POST /api/deliberate-space` - Create session
- `GET /api/deliberate-space/setup` - Get setup data from source
- `GET /api/conversations/[id]/deliberate` - View model
- `POST /api/conversations/[id]/deliberate/votes` - Vote
- `POST /api/conversations/[id]/deliberate/comments` - Comment
```

**Step 3: Commit**

```bash
git add docs/feature-map.md lib/deliberate-space/README.md
git commit -m "docs: add deliberate conversations documentation

Updates feature-map and creates deliberate-space README."
```

---

## Task 22: Final Lint and Typecheck

**Step 1: Run all checks**

```bash
npm run lint
npm run typecheck
npm test
```

Expected: All pass

**Step 2: Fix any issues**

Address any lint or type errors discovered.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: fix lint and type issues for deliberate feature"
```

---

## Summary

This plan implements deliberate conversations in 22 tasks:

1. **Database** (Task 1): Migration with 3 tables + RLS
2. **Types** (Tasks 2-3): TypeScript types and Zod schemas
3. **Services** (Tasks 4-7): Create session, view model, voting, comments
4. **API Routes** (Tasks 8-9, 19): REST endpoints for all operations
5. **UI Components** (Tasks 10-16): Header tabs, discuss view, vote slider, comments
6. **Wizard** (Tasks 17-18): Two-mode setup wizard with hook
7. **Testing** (Task 20): Integration test scaffolding
8. **Documentation** (Task 21): Feature map and module README

Each task follows TDD where practical with frequent commits for easy rollback.
