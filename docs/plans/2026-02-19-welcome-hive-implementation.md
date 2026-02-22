# Welcome Hive & Social Homepage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve onboarding by auto-joining new users to a shared Welcome Hive with social features (presence, activity feed, reactions) and a multi-step conversation card.

**Architecture:** Database-first approach — create tables and RLS policies, then services, then UI. Welcome Hive is a special hive marked by `is_system_hive = true`. Social features use Supabase Realtime (Broadcast for presence, Postgres changes for activity/reactions). Multi-step card groups linked conversations via `source_conversation_id`.

**Tech Stack:** Next.js 15, TypeScript, Supabase (Postgres + Realtime), Tailwind CSS, Jest + React Testing Library

---

## Task Overview

| #   | Task                         | Description                                                      |
| --- | ---------------------------- | ---------------------------------------------------------------- |
| 1   | Database: Social tables      | Create `hive_activity`, `hive_reactions`, `user_presence` tables |
| 2   | Database: System hive column | Add `is_system_hive` column to `hives` table                     |
| 3   | Welcome Hive seed            | Create seed script for Welcome Hive + conversations              |
| 4   | Auto-join on signup          | Add Welcome Hive membership in auth callback                     |
| 5   | Activity service             | Server functions to log and fetch activity                       |
| 6   | Reactions service            | Server functions to add/fetch reactions                          |
| 7   | Presence hook                | Client hook for real-time presence                               |
| 8   | Activity feed hook           | Client hook for real-time activity                               |
| 9   | Reactions hook               | Client hook for real-time reactions                              |
| 10  | Multi-step card component    | Card showing Discuss → Decide with bottom sheet                  |
| 11  | Sidebar components           | Presence, Activity, Reactions sidebar widgets                    |
| 12  | Homepage layout              | Two-column layout with sidebar                                   |
| 13  | Create Hive CTA              | Prominent CTA for Welcome Hive                                   |
| 14  | Mobile responsive            | Sidebar collapse behaviour                                       |

---

## Task 1: Database — Social Tables Migration

**Files:**

- Create: `supabase/migrations/025_create_social_tables.sql`

**Step 1: Write the migration file**

```sql
-- Migration: Create social feature tables for hive homepage
-- Tables: hive_activity, hive_reactions, user_presence

-- ============================================
-- 1. HIVE ACTIVITY TABLE
-- ============================================
-- Stores activity events: joins, responses, votes, phase changes

CREATE TABLE hive_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('join', 'response', 'vote', 'phase_change')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient hive-scoped queries
CREATE INDEX idx_hive_activity_hive_id_created ON hive_activity(hive_id, created_at DESC);

-- Enable RLS
ALTER TABLE hive_activity ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view activity for their hives
CREATE POLICY "Members can view hive activity"
  ON hive_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hive_activity.hive_id
        AND hive_members.user_id = auth.uid()
    )
  );

-- Policy: Authenticated users can insert activity (server will validate)
CREATE POLICY "Authenticated users can insert activity"
  ON hive_activity
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);


-- ============================================
-- 2. HIVE REACTIONS TABLE
-- ============================================
-- Stores emoji reactions with optional short messages

CREATE TABLE hive_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('👋', '🎉', '💡', '❤️', '🐝')),
  message TEXT CHECK (message IS NULL OR char_length(message) <= 50),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- One reaction per emoji type per user per hive
  UNIQUE(hive_id, user_id, emoji)
);

-- Index for efficient hive-scoped queries
CREATE INDEX idx_hive_reactions_hive_id_created ON hive_reactions(hive_id, created_at DESC);

-- Enable RLS
ALTER TABLE hive_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view reactions for their hives
CREATE POLICY "Members can view hive reactions"
  ON hive_reactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hive_reactions.hive_id
        AND hive_members.user_id = auth.uid()
    )
  );

-- Policy: Members can insert their own reactions
CREATE POLICY "Members can insert own reactions"
  ON hive_reactions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = hive_reactions.hive_id
        AND hive_members.user_id = auth.uid()
    )
  );

-- Policy: Users can update their own reactions
CREATE POLICY "Users can update own reactions"
  ON hive_reactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own reactions
CREATE POLICY "Users can delete own reactions"
  ON hive_reactions
  FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================
-- 3. USER PRESENCE TABLE
-- ============================================
-- Tracks last active timestamp per user per hive

CREATE TABLE user_presence (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hive_id UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, hive_id)
);

-- Index for efficient "who's online" queries
CREATE INDEX idx_user_presence_hive_active ON user_presence(hive_id, last_active_at DESC);

-- Enable RLS
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view presence for their hives
CREATE POLICY "Members can view hive presence"
  ON user_presence
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hive_members
      WHERE hive_members.hive_id = user_presence.hive_id
        AND hive_members.user_id = auth.uid()
    )
  );

-- Policy: Users can upsert their own presence
CREATE POLICY "Users can upsert own presence"
  ON user_presence
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
  ON user_presence
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================
-- 4. ENABLE REALTIME
-- ============================================
-- Enable realtime for activity and reactions tables

ALTER PUBLICATION supabase_realtime ADD TABLE hive_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE hive_reactions;
```

**Step 2: Apply the migration locally**

Run: `npx supabase db reset` (applies all migrations)
Expected: Tables created, no errors

**Step 3: Verify tables exist**

Run: `npx supabase db dump --schema public | grep -E "(hive_activity|hive_reactions|user_presence)"`
Expected: Table definitions appear in output

**Step 4: Commit**

```bash
git add supabase/migrations/025_create_social_tables.sql
git commit -m "feat(db): add social feature tables (activity, reactions, presence)

- hive_activity: tracks joins, responses, votes, phase changes
- hive_reactions: emoji reactions with optional messages
- user_presence: last active timestamp per user per hive
- RLS policies for member-only access
- Realtime enabled for activity and reactions"
```

---

## Task 2: Database — System Hive Column

**Files:**

- Create: `supabase/migrations/026_add_system_hive_column.sql`

**Step 1: Write the migration file**

```sql
-- Migration: Add is_system_hive column to hives table
-- System hives (like Welcome Hive) cannot be deleted and have special behaviour

ALTER TABLE hives ADD COLUMN IF NOT EXISTS is_system_hive BOOLEAN DEFAULT false;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_hives_is_system_hive ON hives(is_system_hive) WHERE is_system_hive = true;

-- Prevent deletion of system hives
CREATE OR REPLACE FUNCTION prevent_system_hive_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system_hive = true THEN
    RAISE EXCEPTION 'Cannot delete system hive';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_prevent_system_hive_deletion
  BEFORE DELETE ON hives
  FOR EACH ROW
  EXECUTE FUNCTION prevent_system_hive_deletion();
```

**Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: Column added, trigger created

**Step 3: Commit**

```bash
git add supabase/migrations/026_add_system_hive_column.sql
git commit -m "feat(db): add is_system_hive column with deletion protection"
```

---

## Task 3: Welcome Hive Seed Script

**Files:**

- Create: `scripts/seed-welcome-hive.ts`
- Create: `lib/hives/constants.ts`

**Step 1: Create constants file**

Create `lib/hives/constants.ts`:

```typescript
/**
 * Well-known IDs for system hives.
 * These are stable UUIDs used for seeding and auto-join logic.
 */

// Welcome Hive: Auto-joined by all new users
export const WELCOME_HIVE_ID = "00000000-0000-0000-0000-000000000001";
export const WELCOME_HIVE_SLUG = "welcome";

// Welcome Hive conversation IDs (for multi-step card linking)
export const WELCOME_DISCUSS_ID = "00000000-0000-0000-0000-000000000002";
export const WELCOME_DECIDE_ID = "00000000-0000-0000-0000-000000000003";
```

**Step 2: Create seed script**

Create `scripts/seed-welcome-hive.ts`:

```typescript
/**
 * Seed script: Creates the Welcome Hive and its conversations.
 *
 * Run with: npx tsx scripts/seed-welcome-hive.ts
 *
 * Idempotent: Safe to run multiple times.
 */

import { createClient } from "@supabase/supabase-js";
import {
  WELCOME_HIVE_ID,
  WELCOME_HIVE_SLUG,
  WELCOME_DISCUSS_ID,
  WELCOME_DECIDE_ID,
} from "../lib/hives/constants";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedWelcomeHive() {
  console.log("[seed] Creating Welcome Hive...");

  // 1. Upsert the Welcome Hive
  const { error: hiveError } = await supabase.from("hives").upsert(
    {
      id: WELCOME_HIVE_ID,
      slug: WELCOME_HIVE_SLUG,
      name: "Welcome to Hivemind",
      visibility: "private", // Only joined via auto-join, not searchable
      is_system_hive: true,
    },
    { onConflict: "id" }
  );

  if (hiveError) {
    console.error("[seed] Failed to create Welcome Hive:", hiveError);
    process.exit(1);
  }
  console.log("[seed] Welcome Hive created/updated");

  // 2. Upsert the Discuss conversation
  const { error: discussError } = await supabase.from("conversations").upsert(
    {
      id: WELCOME_DISCUSS_ID,
      hive_id: WELCOME_HIVE_ID,
      slug: "what-should-hive-build-discuss",
      title: "What should Hive build next?",
      description:
        "Share your ideas for new features. What would make Hivemind more useful for your community?",
      type: "understand",
      phase: "listen_open",
      analysis_status: "not_started",
    },
    { onConflict: "id" }
  );

  if (discussError) {
    console.error(
      "[seed] Failed to create Discuss conversation:",
      discussError
    );
    process.exit(1);
  }
  console.log("[seed] Discuss conversation created/updated");

  // 3. Upsert the Decide conversation (linked to Discuss)
  const { error: decideError } = await supabase.from("conversations").upsert(
    {
      id: WELCOME_DECIDE_ID,
      hive_id: WELCOME_HIVE_ID,
      slug: "what-should-hive-build-decide",
      title: "What should Hive build next?",
      description:
        "Vote on the top ideas from our discussion. Use your credits wisely!",
      type: "decide",
      phase: "listen_open", // Will transition to vote_open later
      analysis_status: "not_started",
      source_conversation_id: WELCOME_DISCUSS_ID,
    },
    { onConflict: "id" }
  );

  if (decideError) {
    console.error("[seed] Failed to create Decide conversation:", decideError);
    process.exit(1);
  }
  console.log("[seed] Decide conversation created/updated");

  console.log("[seed] Welcome Hive seeding complete!");
}

seedWelcomeHive().catch((err) => {
  console.error("[seed] Unexpected error:", err);
  process.exit(1);
});
```

**Step 3: Run the seed script**

Run: `npx tsx scripts/seed-welcome-hive.ts`
Expected: "Welcome Hive seeding complete!"

**Step 4: Verify in database**

Run: `npx supabase db dump --data-only | grep "Welcome to Hivemind"`
Expected: Welcome Hive row appears

**Step 5: Commit**

```bash
git add lib/hives/constants.ts scripts/seed-welcome-hive.ts
git commit -m "feat: add Welcome Hive seed script and constants

- WELCOME_HIVE_ID constant for auto-join logic
- Seed script creates hive + linked discuss/decide conversations
- Idempotent: safe to run multiple times"
```

---

## Task 4: Auto-Join Welcome Hive on Signup

**Files:**

- Modify: `app/(auth)/callback/page.tsx`
- Create: `lib/hives/server/joinWelcomeHive.ts`
- Create: `lib/hives/server/__tests__/joinWelcomeHive.test.ts`

**Step 1: Write the failing test**

Create `lib/hives/server/__tests__/joinWelcomeHive.test.ts`:

```typescript
import { joinWelcomeHive } from "../joinWelcomeHive";
import { WELCOME_HIVE_ID } from "../../constants";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("joinWelcomeHive", () => {
  const mockUserId = "user-123";

  const createMockSupabase = (upsertResult: {
    error: Error | null;
  }): SupabaseClient => {
    return {
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockResolvedValue(upsertResult),
      }),
    } as unknown as SupabaseClient;
  };

  it("should upsert membership for Welcome Hive", async () => {
    const supabase = createMockSupabase({ error: null });

    await joinWelcomeHive(supabase, mockUserId);

    expect(supabase.from).toHaveBeenCalledWith("hive_members");
    expect(supabase.from("hive_members").upsert).toHaveBeenCalledWith(
      {
        hive_id: WELCOME_HIVE_ID,
        user_id: mockUserId,
        role: "member",
      },
      { onConflict: "hive_id,user_id" }
    );
  });

  it("should not throw on duplicate membership (idempotent)", async () => {
    const supabase = createMockSupabase({ error: null });

    // Should not throw
    await expect(joinWelcomeHive(supabase, mockUserId)).resolves.not.toThrow();
  });

  it("should throw on database error", async () => {
    const supabase = createMockSupabase({
      error: new Error("Database error"),
    });

    await expect(joinWelcomeHive(supabase, mockUserId)).rejects.toThrow(
      "Failed to join Welcome Hive"
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/hives/server/__tests__/joinWelcomeHive.test.ts`
Expected: FAIL with "Cannot find module '../joinWelcomeHive'"

**Step 3: Write minimal implementation**

Create `lib/hives/server/joinWelcomeHive.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { WELCOME_HIVE_ID } from "../constants";

/**
 * Adds a user to the Welcome Hive.
 * Called on signup to give every new user a home.
 *
 * Idempotent: safe to call multiple times.
 */
export async function joinWelcomeHive(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase.from("hive_members").upsert(
    {
      hive_id: WELCOME_HIVE_ID,
      user_id: userId,
      role: "member",
    },
    { onConflict: "hive_id,user_id" }
  );

  if (error) {
    console.error("[joinWelcomeHive] Error:", error);
    throw new Error("Failed to join Welcome Hive");
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/hives/server/__tests__/joinWelcomeHive.test.ts`
Expected: PASS

**Step 5: Integrate into auth callback**

Modify `app/(auth)/callback/page.tsx`. Find the section after user is authenticated and add:

```typescript
// After user authentication is confirmed, add to Welcome Hive
import { joinWelcomeHive } from "@/lib/hives/server/joinWelcomeHive";
import { createServerClient } from "@/lib/supabase/server";

// In the callback handler, after session is established:
const supabase = await createServerClient();
const {
  data: { user },
} = await supabase.auth.getUser();

if (user) {
  // Auto-join Welcome Hive (idempotent)
  try {
    await joinWelcomeHive(supabase, user.id);
  } catch (err) {
    // Log but don't block signup
    console.error("[callback] Failed to join Welcome Hive:", err);
  }
}
```

**Step 6: Run linter and tests**

Run: `npm run lint && npm test`
Expected: All pass

**Step 7: Commit**

```bash
git add lib/hives/server/joinWelcomeHive.ts lib/hives/server/__tests__/joinWelcomeHive.test.ts app/\(auth\)/callback/page.tsx
git commit -m "feat: auto-join Welcome Hive on signup

- joinWelcomeHive service: idempotent membership creation
- Integrated into auth callback
- Includes unit tests"
```

---

## Task 5: Activity Service

**Files:**

- Create: `lib/social/types.ts`
- Create: `lib/social/server/activityService.ts`
- Create: `lib/social/server/__tests__/activityService.test.ts`

**Step 1: Create types**

Create `lib/social/types.ts`:

```typescript
/**
 * Types for social features: activity, reactions, presence.
 */

export type ActivityEventType = "join" | "response" | "vote" | "phase_change";

export interface ActivityEvent {
  id: string;
  hiveId: string;
  eventType: ActivityEventType;
  userId: string | null; // null for anonymised events
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityEventInput {
  hiveId: string;
  eventType: ActivityEventType;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

export type ReactionEmoji = "👋" | "🎉" | "💡" | "❤️" | "🐝";

export interface Reaction {
  id: string;
  hiveId: string;
  userId: string;
  emoji: ReactionEmoji;
  message: string | null;
  createdAt: string;
}

export interface ReactionInput {
  hiveId: string;
  emoji: ReactionEmoji;
  message?: string | null;
}

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  lastActiveAt: string;
}
```

**Step 2: Write the failing test**

Create `lib/social/server/__tests__/activityService.test.ts`:

```typescript
import { logActivity, getRecentActivity } from "../activityService";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("activityService", () => {
  describe("logActivity", () => {
    const createMockSupabase = (insertResult: {
      error: Error | null;
    }): SupabaseClient => {
      return {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue(insertResult),
        }),
      } as unknown as SupabaseClient;
    };

    it("should insert activity event", async () => {
      const supabase = createMockSupabase({ error: null });

      await logActivity(supabase, {
        hiveId: "hive-123",
        eventType: "join",
        userId: "user-456",
      });

      expect(supabase.from).toHaveBeenCalledWith("hive_activity");
      expect(supabase.from("hive_activity").insert).toHaveBeenCalledWith({
        hive_id: "hive-123",
        event_type: "join",
        user_id: "user-456",
        metadata: {},
      });
    });

    it("should allow null userId for anonymised events", async () => {
      const supabase = createMockSupabase({ error: null });

      await logActivity(supabase, {
        hiveId: "hive-123",
        eventType: "response",
        userId: null,
        metadata: { count: 1 },
      });

      expect(supabase.from("hive_activity").insert).toHaveBeenCalledWith({
        hive_id: "hive-123",
        event_type: "response",
        user_id: null,
        metadata: { count: 1 },
      });
    });
  });

  describe("getRecentActivity", () => {
    const mockActivities = [
      {
        id: "act-1",
        hive_id: "hive-123",
        event_type: "join",
        user_id: "user-1",
        metadata: {},
        created_at: "2026-02-19T10:00:00Z",
      },
    ];

    const createMockSupabase = (data: unknown[]): SupabaseClient => {
      return {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data, error: null }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;
    };

    it("should fetch recent activity for a hive", async () => {
      const supabase = createMockSupabase(mockActivities);

      const result = await getRecentActivity(supabase, "hive-123", 10);

      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe("join");
      expect(result[0].hiveId).toBe("hive-123");
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test -- lib/social/server/__tests__/activityService.test.ts`
Expected: FAIL with "Cannot find module '../activityService'"

**Step 4: Write minimal implementation**

Create `lib/social/server/activityService.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityEvent, ActivityEventInput } from "../types";

/**
 * Logs an activity event to the hive_activity table.
 */
export async function logActivity(
  supabase: SupabaseClient,
  input: ActivityEventInput
): Promise<void> {
  const { error } = await supabase.from("hive_activity").insert({
    hive_id: input.hiveId,
    event_type: input.eventType,
    user_id: input.userId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error("[logActivity] Error:", error);
    // Don't throw - activity logging is non-critical
  }
}

/**
 * Fetches recent activity events for a hive.
 */
export async function getRecentActivity(
  supabase: SupabaseClient,
  hiveId: string,
  limit: number = 15
): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from("hive_activity")
    .select("id, hive_id, event_type, user_id, metadata, created_at")
    .eq("hive_id", hiveId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getRecentActivity] Error:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    hiveId: row.hive_id,
    eventType: row.event_type,
    userId: row.user_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }));
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- lib/social/server/__tests__/activityService.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/social/types.ts lib/social/server/activityService.ts lib/social/server/__tests__/activityService.test.ts
git commit -m "feat: add activity service for hive activity feed

- logActivity: inserts events (join, response, vote, phase_change)
- getRecentActivity: fetches recent events for display
- Includes unit tests"
```

---

## Task 6: Reactions Service

**Files:**

- Create: `lib/social/server/reactionsService.ts`
- Create: `lib/social/server/__tests__/reactionsService.test.ts`

**Step 1: Write the failing test**

Create `lib/social/server/__tests__/reactionsService.test.ts`:

```typescript
import { addReaction, getRecentReactions } from "../reactionsService";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("reactionsService", () => {
  const mockUserId = "user-123";
  const mockHiveId = "hive-456";

  describe("addReaction", () => {
    const createMockSupabase = (upsertResult: {
      error: Error | null;
    }): SupabaseClient => {
      return {
        from: jest.fn().mockReturnValue({
          upsert: jest.fn().mockResolvedValue(upsertResult),
        }),
      } as unknown as SupabaseClient;
    };

    it("should upsert reaction with emoji and message", async () => {
      const supabase = createMockSupabase({ error: null });

      await addReaction(supabase, mockUserId, {
        hiveId: mockHiveId,
        emoji: "👋",
        message: "Hello!",
      });

      expect(supabase.from).toHaveBeenCalledWith("hive_reactions");
      expect(supabase.from("hive_reactions").upsert).toHaveBeenCalledWith(
        {
          hive_id: mockHiveId,
          user_id: mockUserId,
          emoji: "👋",
          message: "Hello!",
        },
        { onConflict: "hive_id,user_id,emoji" }
      );
    });

    it("should allow null message", async () => {
      const supabase = createMockSupabase({ error: null });

      await addReaction(supabase, mockUserId, {
        hiveId: mockHiveId,
        emoji: "🎉",
      });

      expect(supabase.from("hive_reactions").upsert).toHaveBeenCalledWith(
        expect.objectContaining({ message: null }),
        expect.any(Object)
      );
    });
  });

  describe("getRecentReactions", () => {
    const mockReactions = [
      {
        id: "react-1",
        hive_id: mockHiveId,
        user_id: mockUserId,
        emoji: "👋",
        message: "Hi!",
        created_at: "2026-02-19T10:00:00Z",
      },
    ];

    const createMockSupabase = (data: unknown[]): SupabaseClient => {
      return {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data, error: null }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;
    };

    it("should fetch recent reactions for a hive", async () => {
      const supabase = createMockSupabase(mockReactions);

      const result = await getRecentReactions(supabase, mockHiveId, 10);

      expect(result).toHaveLength(1);
      expect(result[0].emoji).toBe("👋");
      expect(result[0].message).toBe("Hi!");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/social/server/__tests__/reactionsService.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `lib/social/server/reactionsService.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reaction, ReactionInput } from "../types";

/**
 * Adds or updates a reaction for a user in a hive.
 * One reaction per emoji type per user (upsert).
 */
export async function addReaction(
  supabase: SupabaseClient,
  userId: string,
  input: ReactionInput
): Promise<void> {
  const { error } = await supabase.from("hive_reactions").upsert(
    {
      hive_id: input.hiveId,
      user_id: userId,
      emoji: input.emoji,
      message: input.message ?? null,
    },
    { onConflict: "hive_id,user_id,emoji" }
  );

  if (error) {
    console.error("[addReaction] Error:", error);
    throw new Error("Failed to add reaction");
  }
}

/**
 * Fetches recent reactions for a hive.
 */
export async function getRecentReactions(
  supabase: SupabaseClient,
  hiveId: string,
  limit: number = 20
): Promise<Reaction[]> {
  const { data, error } = await supabase
    .from("hive_reactions")
    .select("id, hive_id, user_id, emoji, message, created_at")
    .eq("hive_id", hiveId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getRecentReactions] Error:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    hiveId: row.hive_id,
    userId: row.user_id,
    emoji: row.emoji,
    message: row.message,
    createdAt: row.created_at,
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/social/server/__tests__/reactionsService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/social/server/reactionsService.ts lib/social/server/__tests__/reactionsService.test.ts
git commit -m "feat: add reactions service for hive reaction wall

- addReaction: upserts emoji reactions (one per type per user)
- getRecentReactions: fetches recent reactions for display
- Includes unit tests"
```

---

## Task 7: Presence Hook

**Files:**

- Create: `lib/social/hooks/useHivePresence.ts`
- Create: `lib/social/hooks/__tests__/useHivePresence.test.tsx`

**Step 1: Write the failing test**

Create `lib/social/hooks/__tests__/useHivePresence.test.tsx`:

```typescript
import { renderHook, act, waitFor } from "@testing-library/react";
import { useHivePresence } from "../useHivePresence";

// Mock Supabase
const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn((callback) => {
    setTimeout(() => callback("SUBSCRIBED"), 0);
    return mockChannel;
  }),
  track: jest.fn().mockResolvedValue("ok"),
  presenceState: jest.fn().mockReturnValue({}),
};

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  },
}));

describe("useHivePresence", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return empty array initially", () => {
    const { result } = renderHook(() =>
      useHivePresence({ hiveId: "hive-123", userId: "user-456" })
    );

    expect(result.current.activeUsers).toEqual([]);
  });

  it("should subscribe to presence channel", async () => {
    renderHook(() =>
      useHivePresence({ hiveId: "hive-123", userId: "user-456" })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    const { supabase } = await import("@/lib/supabase/client");
    expect(supabase.channel).toHaveBeenCalledWith("hive:hive-123:presence", {
      config: { presence: { key: "user-456" } },
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/social/hooks/__tests__/useHivePresence.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `lib/social/hooks/useHivePresence.ts`:

```typescript
"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PresenceUser } from "../types";

interface UseHivePresenceOptions {
  hiveId: string;
  userId: string;
  displayName?: string;
  avatarUrl?: string | null;
}

interface UseHivePresenceResult {
  activeUsers: PresenceUser[];
  status: "connecting" | "connected" | "error" | "disconnected";
}

/**
 * Hook for real-time presence tracking in a hive.
 * Shows who's currently active in the hive.
 */
export function useHivePresence({
  hiveId,
  userId,
  displayName = "Anonymous",
  avatarUrl = null,
}: UseHivePresenceOptions): UseHivePresenceResult {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const [status, setStatus] =
    useState<UseHivePresenceResult["status"]>("disconnected");
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase || !hiveId || !userId) {
      return;
    }

    const channelName = `hive:${hiveId}:presence`;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = [];

        for (const [key, presences] of Object.entries(state)) {
          const presence = (
            presences as Array<{
              displayName: string;
              avatarUrl: string | null;
            }>
          )[0];
          if (presence) {
            users.push({
              userId: key,
              displayName: presence.displayName || "Anonymous",
              avatarUrl: presence.avatarUrl || null,
              lastActiveAt: new Date().toISOString(),
            });
          }
        }

        setActiveUsers(users);
      })
      .subscribe(async (subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("connected");
          // Track our own presence
          await channel.track({
            displayName,
            avatarUrl,
          });
        } else if (subscriptionStatus === "CHANNEL_ERROR") {
          setStatus("error");
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [hiveId, userId, displayName, avatarUrl]);

  return { activeUsers, status };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/social/hooks/__tests__/useHivePresence.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/social/hooks/useHivePresence.ts lib/social/hooks/__tests__/useHivePresence.test.tsx
git commit -m "feat: add useHivePresence hook for real-time presence

- Tracks who's active in a hive
- Uses Supabase Presence API
- Returns activeUsers array and connection status
- Includes unit tests"
```

---

## Task 8: Activity Feed Hook

**Files:**

- Create: `lib/social/hooks/useHiveActivity.ts`

**Step 1: Write the hook**

Create `lib/social/hooks/useHiveActivity.ts`:

```typescript
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type { ActivityEvent } from "../types";

interface UseHiveActivityOptions {
  hiveId: string;
  initialActivity?: ActivityEvent[];
}

interface UseHiveActivityResult {
  activity: ActivityEvent[];
  status: "connecting" | "connected" | "error" | "disconnected";
}

/**
 * Hook for real-time activity feed in a hive.
 * Subscribes to new activity events via Postgres changes.
 */
export function useHiveActivity({
  hiveId,
  initialActivity = [],
}: UseHiveActivityOptions): UseHiveActivityResult {
  const [activity, setActivity] = useState<ActivityEvent[]>(initialActivity);
  const [status, setStatus] =
    useState<UseHiveActivityResult["status"]>("disconnected");
  const channelRef = useRef<RealtimeChannel | null>(null);

  const handleNewActivity = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as {
          id: string;
          hive_id: string;
          event_type: string;
          user_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };

        const newEvent: ActivityEvent = {
          id: row.id,
          hiveId: row.hive_id,
          eventType: row.event_type as ActivityEvent["eventType"],
          userId: row.user_id,
          metadata: row.metadata ?? {},
          createdAt: row.created_at,
        };

        setActivity((prev) => [newEvent, ...prev].slice(0, 15));
      }
    },
    []
  );

  useEffect(() => {
    if (!supabase || !hiveId) {
      return;
    }

    const channelName = `hive:${hiveId}:activity`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "hive_activity",
          filter: `hive_id=eq.${hiveId}`,
        },
        handleNewActivity
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("connected");
        } else if (subscriptionStatus === "CHANNEL_ERROR") {
          setStatus("error");
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [hiveId, handleNewActivity]);

  return { activity, status };
}
```

**Step 2: Commit**

```bash
git add lib/social/hooks/useHiveActivity.ts
git commit -m "feat: add useHiveActivity hook for real-time activity feed

- Subscribes to postgres_changes on hive_activity table
- Prepends new events to activity list
- Limits to 15 most recent events"
```

---

## Task 9: Reactions Hook

**Files:**

- Create: `lib/social/hooks/useHiveReactions.ts`

**Step 1: Write the hook**

Create `lib/social/hooks/useHiveReactions.ts`:

```typescript
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type { Reaction } from "../types";

interface UseHiveReactionsOptions {
  hiveId: string;
  initialReactions?: Reaction[];
}

interface UseHiveReactionsResult {
  reactions: Reaction[];
  status: "connecting" | "connected" | "error" | "disconnected";
}

/**
 * Hook for real-time reactions in a hive.
 * Subscribes to new/updated reactions via Postgres changes.
 */
export function useHiveReactions({
  hiveId,
  initialReactions = [],
}: UseHiveReactionsOptions): UseHiveReactionsResult {
  const [reactions, setReactions] = useState<Reaction[]>(initialReactions);
  const [status, setStatus] =
    useState<UseHiveReactionsResult["status"]>("disconnected");
  const channelRef = useRef<RealtimeChannel | null>(null);

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as {
          id: string;
          hive_id: string;
          user_id: string;
          emoji: string;
          message: string | null;
          created_at: string;
        };

        const newReaction: Reaction = {
          id: row.id,
          hiveId: row.hive_id,
          userId: row.user_id,
          emoji: row.emoji as Reaction["emoji"],
          message: row.message,
          createdAt: row.created_at,
        };

        setReactions((prev) => [newReaction, ...prev].slice(0, 20));
      }
    },
    []
  );

  useEffect(() => {
    if (!supabase || !hiveId) {
      return;
    }

    const channelName = `hive:${hiveId}:reactions`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "hive_reactions",
          filter: `hive_id=eq.${hiveId}`,
        },
        handleChange
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("connected");
        } else if (subscriptionStatus === "CHANNEL_ERROR") {
          setStatus("error");
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [hiveId, handleChange]);

  return { reactions, status };
}
```

**Step 2: Create index file for hooks**

Create `lib/social/hooks/index.ts`:

```typescript
export { useHivePresence } from "./useHivePresence";
export { useHiveActivity } from "./useHiveActivity";
export { useHiveReactions } from "./useHiveReactions";
```

**Step 3: Commit**

```bash
git add lib/social/hooks/useHiveReactions.ts lib/social/hooks/index.ts
git commit -m "feat: add useHiveReactions hook for real-time reaction wall

- Subscribes to postgres_changes on hive_reactions table
- Prepends new reactions to list
- Limits to 20 most recent reactions
- Also adds hooks index file"
```

---

## Task 10: Multi-Step Conversation Card Component

**Files:**

- Create: `components/conversations/MultiStepCard.tsx`
- Create: `components/conversations/__tests__/MultiStepCard.test.tsx`

**Step 1: Write the failing test**

Create `components/conversations/__tests__/MultiStepCard.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiStepCard } from '../MultiStepCard';

const mockDiscuss = {
  id: 'discuss-1',
  slug: 'test-discuss',
  type: 'understand' as const,
  title: 'What should we build?',
  phase: 'listen_open',
  responseCount: 42,
};

const mockDecide = {
  id: 'decide-1',
  slug: 'test-decide',
  type: 'decide' as const,
  title: 'What should we build?',
  phase: 'listen_open',
  responseCount: 0,
};

describe('MultiStepCard', () => {
  it('should render the conversation title', () => {
    render(
      <MultiStepCard
        hiveKey="test-hive"
        discussConversation={mockDiscuss}
        decideConversation={mockDecide}
      />
    );

    expect(screen.getByText('What should we build?')).toBeInTheDocument();
  });

  it('should show step indicators', () => {
    render(
      <MultiStepCard
        hiveKey="test-hive"
        discussConversation={mockDiscuss}
        decideConversation={mockDecide}
      />
    );

    expect(screen.getByText('Discuss')).toBeInTheDocument();
    expect(screen.getByText('Decide')).toBeInTheDocument();
  });

  it('should open menu on card click', () => {
    render(
      <MultiStepCard
        hiveKey="test-hive"
        discussConversation={mockDiscuss}
        decideConversation={mockDecide}
      />
    );

    const card = screen.getByRole('button');
    fireEvent.click(card);

    expect(screen.getByText('View Discussion')).toBeInTheDocument();
    expect(screen.getByText('View Decision')).toBeInTheDocument();
  });

  it('should close menu when clicking scrim', () => {
    render(
      <MultiStepCard
        hiveKey="test-hive"
        discussConversation={mockDiscuss}
        decideConversation={mockDecide}
      />
    );

    const card = screen.getByRole('button');
    fireEvent.click(card);

    const scrim = screen.getByTestId('card-scrim');
    fireEvent.click(scrim);

    expect(screen.queryByText('View Discussion')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- components/conversations/__tests__/MultiStepCard.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `components/conversations/MultiStepCard.tsx`:

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';

interface ConversationSummary {
  id: string;
  slug: string;
  type: 'understand' | 'decide';
  title: string;
  phase: string;
  responseCount?: number;
}

interface MultiStepCardProps {
  hiveKey: string;
  discussConversation: ConversationSummary;
  decideConversation: ConversationSummary;
}

type StepStatus = 'empty' | 'partial' | 'complete';

function getStepStatus(phase: string, type: 'understand' | 'decide'): StepStatus {
  if (type === 'understand') {
    if (phase === 'report_open') return 'complete';
    if (phase === 'listen_open') return 'partial';
    return 'partial';
  } else {
    if (phase === 'result_open') return 'complete';
    if (phase === 'vote_open') return 'partial';
    if (phase === 'listen_open') return 'partial';
    return 'empty';
  }
}

function StepIndicator({
  label,
  status,
}: {
  label: string;
  status: StepStatus;
}) {
  const bgColor =
    status === 'complete'
      ? 'bg-green-500'
      : status === 'partial'
        ? 'bg-amber-400'
        : 'bg-gray-200';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`h-4 w-4 rounded-full ${bgColor}`} />
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}

export function MultiStepCard({
  hiveKey,
  discussConversation,
  decideConversation,
}: MultiStepCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const discussStatus = getStepStatus(discussConversation.phase, 'understand');
  const decideStatus = getStepStatus(decideConversation.phase, 'decide');

  const responseCount = discussConversation.responseCount ?? 0;
  const summaryText =
    responseCount > 0
      ? `${responseCount} ideas shared`
      : 'Be the first to share an idea';

  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Card content (clickable) */}
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="w-full p-4 text-left hover:bg-gray-50"
      >
        <h3 className="mb-3 text-lg font-semibold text-gray-900">
          {discussConversation.title}
        </h3>

        {/* Step indicators */}
        <div className="mb-3 flex items-center gap-2">
          <StepIndicator label="Discuss" status={discussStatus} />
          <div className="h-px flex-1 bg-gray-200" />
          <StepIndicator label="Decide" status={decideStatus} />
        </div>

        <p className="text-sm text-gray-500">{summaryText}</p>
      </button>

      {/* Internal bottom sheet menu */}
      {menuOpen && (
        <>
          {/* Scrim */}
          <div
            data-testid="card-scrim"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />

          {/* Menu */}
          <div className="absolute inset-x-0 bottom-0 rounded-t-lg bg-white p-3 shadow-lg">
            <Link
              href={`/hives/${hiveKey}/conversations/${discussConversation.slug || discussConversation.id}`}
              className="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-3 w-3 rounded-full ${discussStatus === 'complete' ? 'bg-green-500' : 'bg-amber-400'}`}
                />
                <span className="font-medium">View Discussion</span>
              </div>
              <span className="text-sm text-gray-500">
                {responseCount} ideas →
              </span>
            </Link>

            <Link
              href={`/hives/${hiveKey}/conversations/${decideConversation.slug || decideConversation.id}`}
              className="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-3 w-3 rounded-full ${decideStatus === 'complete' ? 'bg-green-500' : decideStatus === 'partial' ? 'bg-amber-400' : 'bg-gray-200'}`}
                />
                <span className="font-medium">View Decision</span>
              </div>
              <span className="text-sm text-gray-500">
                {decideConversation.phase === 'vote_open' ? 'Vote now →' : 'Coming soon'}
              </span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- components/conversations/__tests__/MultiStepCard.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/conversations/MultiStepCard.tsx components/conversations/__tests__/MultiStepCard.test.tsx
git commit -m "feat: add MultiStepCard component for Discuss → Decide journey

- Shows step indicators with fill status
- Internal bottom sheet menu on click
- Links to both conversation pages
- Includes unit tests"
```

---

## Task 11: Sidebar Components

**Files:**

- Create: `components/social/PresenceSidebar.tsx`
- Create: `components/social/ActivitySidebar.tsx`
- Create: `components/social/ReactionsSidebar.tsx`
- Create: `components/social/index.ts`

**Step 1: Create PresenceSidebar**

Create `components/social/PresenceSidebar.tsx`:

```typescript
'use client';

import { useHivePresence } from '@/lib/social/hooks';
import type { PresenceUser } from '@/lib/social/types';

interface PresenceSidebarProps {
  hiveId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

function UserAvatar({ user }: { user: PresenceUser }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
            {user.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
      </div>
      <span className="text-sm text-gray-700">{user.displayName}</span>
    </div>
  );
}

export function PresenceSidebar({
  hiveId,
  userId,
  displayName,
  avatarUrl,
}: PresenceSidebarProps) {
  const { activeUsers, status } = useHivePresence({
    hiveId,
    userId,
    displayName,
    avatarUrl,
  });

  const visibleUsers = activeUsers.slice(0, 4);
  const overflowCount = Math.max(0, activeUsers.length - 4);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Who's here</h3>

      {status === 'connecting' && (
        <p className="text-sm text-gray-500">Connecting...</p>
      )}

      {status === 'connected' && activeUsers.length === 0 && (
        <p className="text-sm text-gray-500">Just you for now</p>
      )}

      <div className="space-y-2">
        {visibleUsers.map((user) => (
          <UserAvatar key={user.userId} user={user} />
        ))}
      </div>

      {overflowCount > 0 && (
        <p className="mt-2 text-sm text-gray-500">+ {overflowCount} others</p>
      )}
    </div>
  );
}
```

**Step 2: Create ActivitySidebar**

Create `components/social/ActivitySidebar.tsx`:

```typescript
'use client';

import { useHiveActivity } from '@/lib/social/hooks';
import type { ActivityEvent } from '@/lib/social/types';
import { formatDistanceToNow } from 'date-fns';

interface ActivitySidebarProps {
  hiveId: string;
  initialActivity: ActivityEvent[];
}

function getActivityText(event: ActivityEvent): string {
  switch (event.eventType) {
    case 'join':
      return 'Someone joined';
    case 'response':
      return 'Someone shared an idea';
    case 'vote':
      return '+1 vote';
    case 'phase_change':
      return (event.metadata as { message?: string })?.message || 'Phase changed';
    default:
      return 'Activity';
  }
}

export function ActivitySidebar({
  hiveId,
  initialActivity,
}: ActivitySidebarProps) {
  const { activity, status } = useHiveActivity({ hiveId, initialActivity });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Activity</h3>

      {activity.length === 0 && (
        <p className="text-sm text-gray-500">No recent activity</p>
      )}

      <div className="space-y-2">
        {activity.map((event) => (
          <div key={event.id} className="flex items-start justify-between gap-2">
            <p className="text-sm text-gray-700">{getActivityText(event)}</p>
            <span className="shrink-0 text-xs text-gray-400">
              {formatDistanceToNow(new Date(event.createdAt), { addSuffix: false })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Create ReactionsSidebar**

Create `components/social/ReactionsSidebar.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useHiveReactions } from '@/lib/social/hooks';
import type { Reaction, ReactionEmoji } from '@/lib/social/types';

interface ReactionsSidebarProps {
  hiveId: string;
  initialReactions: Reaction[];
  onAddReaction: (emoji: ReactionEmoji, message?: string) => Promise<void>;
}

const EMOJI_OPTIONS: ReactionEmoji[] = ['👋', '🎉', '💡', '❤️', '🐝'];

export function ReactionsSidebar({
  hiveId,
  initialReactions,
  onAddReaction,
}: ReactionsSidebarProps) {
  const { reactions } = useHiveReactions({ hiveId, initialReactions });
  const [showPicker, setShowPicker] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<ReactionEmoji | null>(null);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedEmoji) return;

    setIsSubmitting(true);
    try {
      await onAddReaction(selectedEmoji, message || undefined);
      setShowPicker(false);
      setSelectedEmoji(null);
      setMessage('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Reactions</h3>

      {/* Reaction list */}
      <div className="mb-3 space-y-2">
        {reactions.slice(0, 5).map((reaction) => (
          <div key={reaction.id} className="flex items-start gap-2">
            <span className="text-lg">{reaction.emoji}</span>
            {reaction.message && (
              <span className="text-sm text-gray-700">{reaction.message}</span>
            )}
          </div>
        ))}
        {reactions.length === 0 && (
          <p className="text-sm text-gray-500">Be the first to react!</p>
        )}
      </div>

      {/* Add reaction button/picker */}
      {!showPicker ? (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="w-full rounded-lg border border-dashed border-gray-300 p-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600"
        >
          + Add reaction
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-1">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setSelectedEmoji(emoji)}
                className={`rounded-lg p-2 text-xl hover:bg-gray-100 ${
                  selectedEmoji === emoji ? 'bg-amber-100' : ''
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a message (optional)"
            maxLength={50}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowPicker(false);
                setSelectedEmoji(null);
                setMessage('');
              }}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedEmoji || isSubmitting}
              className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Create index file**

Create `components/social/index.ts`:

```typescript
export { PresenceSidebar } from "./PresenceSidebar";
export { ActivitySidebar } from "./ActivitySidebar";
export { ReactionsSidebar } from "./ReactionsSidebar";
```

**Step 5: Commit**

```bash
git add components/social/PresenceSidebar.tsx components/social/ActivitySidebar.tsx components/social/ReactionsSidebar.tsx components/social/index.ts
git commit -m "feat: add sidebar components for social features

- PresenceSidebar: shows active users with avatars
- ActivitySidebar: shows recent activity feed
- ReactionsSidebar: shows reactions with add picker"
```

---

## Task 12: Homepage Layout with Sidebar

**Files:**

- Modify: `app/hives/[hiveId]/HiveHome.tsx`
- Create: `app/hives/[hiveId]/HiveHomeSidebar.tsx`

**Step 1: Create sidebar wrapper**

Create `app/hives/[hiveId]/HiveHomeSidebar.tsx`:

```typescript
'use client';

import {
  PresenceSidebar,
  ActivitySidebar,
  ReactionsSidebar,
} from '@/components/social';
import type { ActivityEvent, Reaction, ReactionEmoji } from '@/lib/social/types';

interface HiveHomeSidebarProps {
  hiveId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  initialActivity: ActivityEvent[];
  initialReactions: Reaction[];
  onAddReaction: (emoji: ReactionEmoji, message?: string) => Promise<void>;
}

export function HiveHomeSidebar({
  hiveId,
  userId,
  displayName,
  avatarUrl,
  initialActivity,
  initialReactions,
  onAddReaction,
}: HiveHomeSidebarProps) {
  return (
    <aside className="space-y-4">
      <PresenceSidebar
        hiveId={hiveId}
        userId={userId}
        displayName={displayName}
        avatarUrl={avatarUrl}
      />
      <ActivitySidebar hiveId={hiveId} initialActivity={initialActivity} />
      <ReactionsSidebar
        hiveId={hiveId}
        initialReactions={initialReactions}
        onAddReaction={onAddReaction}
      />
    </aside>
  );
}
```

**Step 2: Update HiveHome layout**

Modify `app/hives/[hiveId]/HiveHome.tsx` to add two-column layout:

```typescript
// Add to imports
import { HiveHomeSidebar } from './HiveHomeSidebar';

// Update the component to accept sidebar props
interface HiveHomeProps {
  hiveId: string;
  hiveKey: string;
  hiveName: string;
  conversations: ConversationCardData[];
  logoUrl?: string | null;
  // New props for sidebar
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  initialActivity: ActivityEvent[];
  initialReactions: Reaction[];
}

// Update the JSX to use two-column layout
export function HiveHome({
  hiveId,
  hiveKey,
  hiveName,
  conversations,
  logoUrl,
  userId,
  displayName,
  avatarUrl,
  initialActivity,
  initialReactions,
}: HiveHomeProps) {
  const handleAddReaction = async (emoji: ReactionEmoji, message?: string) => {
    // Call API to add reaction
    await fetch(`/api/hives/${hiveId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji, message }),
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <header className="mb-6">
        {/* Existing header code */}
      </header>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Main content */}
        <main className="flex-1">
          {/* Existing conversation grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {conversations.map((conversation) => (
              <ConversationCard key={conversation.id} {...conversation} />
            ))}
          </div>
        </main>

        {/* Sidebar - hidden on mobile */}
        <div className="hidden w-72 shrink-0 lg:block">
          <HiveHomeSidebar
            hiveId={hiveId}
            userId={userId}
            displayName={displayName}
            avatarUrl={avatarUrl}
            initialActivity={initialActivity}
            initialReactions={initialReactions}
            onAddReaction={handleAddReaction}
          />
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Update page.tsx to fetch sidebar data**

Modify `app/hives/[hiveId]/page.tsx` to fetch activity and reactions:

```typescript
// Add imports
import { getRecentActivity } from '@/lib/social/server/activityService';
import { getRecentReactions } from '@/lib/social/server/reactionsService';

// In the server component, fetch additional data
const [activity, reactions] = await Promise.all([
  getRecentActivity(supabase, hiveId, 15),
  getRecentReactions(supabase, hiveId, 20),
]);

// Pass to HiveHome
<HiveHome
  hiveId={hiveId}
  hiveKey={hiveKey}
  hiveName={hive.name}
  conversations={conversations}
  logoUrl={signedLogoUrl}
  userId={session.user.id}
  displayName={profile?.display_name || 'Anonymous'}
  avatarUrl={profile?.avatar_url || null}
  initialActivity={activity}
  initialReactions={reactions}
/>
```

**Step 4: Run linter**

Run: `npm run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add app/hives/\[hiveId\]/HiveHome.tsx app/hives/\[hiveId\]/HiveHomeSidebar.tsx app/hives/\[hiveId\]/page.tsx
git commit -m "feat: add two-column hive homepage layout with social sidebar

- Main content area with conversation cards
- Right sidebar with presence, activity, reactions
- Hidden on mobile (lg:block)
- Server-side initial data fetch"
```

---

## Task 13: Create Hive CTA

**Files:**

- Create: `components/hives/CreateHiveCTA.tsx`
- Modify: `app/hives/[hiveId]/HiveHome.tsx`

**Step 1: Create the CTA component**

Create `components/hives/CreateHiveCTA.tsx`:

```typescript
import Link from 'next/link';

interface CreateHiveCTAProps {
  variant?: 'subtle' | 'prominent';
}

export function CreateHiveCTA({ variant = 'subtle' }: CreateHiveCTAProps) {
  if (variant === 'prominent') {
    return (
      <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-6 text-center">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          Ready to start your own?
        </h3>
        <p className="mb-4 text-sm text-gray-600">
          Create a hive for your team, community, or project.
        </p>
        <Link
          href="/hives/new"
          className="inline-flex items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          Create a Hive →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
      <span className="text-sm text-gray-600">Ready to start your own?</span>
      <Link
        href="/hives/new"
        className="text-sm font-medium text-amber-600 hover:text-amber-700"
      >
        Create a Hive →
      </Link>
    </div>
  );
}
```

**Step 2: Add to HiveHome for Welcome Hive**

Modify `app/hives/[hiveId]/HiveHome.tsx`:

```typescript
// Add import
import { CreateHiveCTA } from '@/components/hives/CreateHiveCTA';
import { WELCOME_HIVE_ID } from '@/lib/hives/constants';

// Add prop
interface HiveHomeProps {
  // ... existing props
  isWelcomeHive?: boolean;
}

// In the JSX, after the conversation grid:
{isWelcomeHive && (
  <div className="mt-6">
    <CreateHiveCTA variant="prominent" />
  </div>
)}
```

**Step 3: Update page.tsx to detect Welcome Hive**

```typescript
// In page.tsx, after fetching hive:
const isWelcomeHive = hiveId === WELCOME_HIVE_ID;

// Pass to component
<HiveHome
  // ... existing props
  isWelcomeHive={isWelcomeHive}
/>
```

**Step 4: Commit**

```bash
git add components/hives/CreateHiveCTA.tsx app/hives/\[hiveId\]/HiveHome.tsx app/hives/\[hiveId\]/page.tsx
git commit -m "feat: add Create Hive CTA for Welcome Hive

- Subtle and prominent variants
- Shows prominently on Welcome Hive page
- Links to /hives/new"
```

---

## Task 14: Mobile Responsive Sidebar

**Files:**

- Modify: `app/hives/[hiveId]/HiveHome.tsx`
- Create: `components/social/MobileSocialSheet.tsx`

**Step 1: Create mobile bottom sheet**

Create `components/social/MobileSocialSheet.tsx`:

```typescript
'use client';

import { useState } from 'react';
import {
  PresenceSidebar,
  ActivitySidebar,
  ReactionsSidebar,
} from '@/components/social';
import type { ActivityEvent, Reaction, ReactionEmoji } from '@/lib/social/types';

interface MobileSocialSheetProps {
  hiveId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  initialActivity: ActivityEvent[];
  initialReactions: Reaction[];
  onAddReaction: (emoji: ReactionEmoji, message?: string) => Promise<void>;
}

type Tab = 'presence' | 'activity' | 'reactions';

export function MobileSocialSheet({
  hiveId,
  userId,
  displayName,
  avatarUrl,
  initialActivity,
  initialReactions,
  onAddReaction,
}: MobileSocialSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('activity');

  return (
    <>
      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg lg:hidden"
      >
        <span className="text-2xl">💬</span>
      </button>

      {/* Bottom sheet */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Sheet */}
          <div className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white">
            {/* Handle */}
            <div className="sticky top-0 flex justify-center bg-white py-2">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {(['presence', 'activity', 'reactions'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-3 text-sm font-medium ${
                    activeTab === tab
                      ? 'border-b-2 border-amber-500 text-amber-600'
                      : 'text-gray-500'
                  }`}
                >
                  {tab === 'presence' && "Who's here"}
                  {tab === 'activity' && 'Activity'}
                  {tab === 'reactions' && 'Reactions'}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-4">
              {activeTab === 'presence' && (
                <PresenceSidebar
                  hiveId={hiveId}
                  userId={userId}
                  displayName={displayName}
                  avatarUrl={avatarUrl}
                />
              )}
              {activeTab === 'activity' && (
                <ActivitySidebar
                  hiveId={hiveId}
                  initialActivity={initialActivity}
                />
              )}
              {activeTab === 'reactions' && (
                <ReactionsSidebar
                  hiveId={hiveId}
                  initialReactions={initialReactions}
                  onAddReaction={onAddReaction}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

**Step 2: Add to HiveHome**

Update `app/hives/[hiveId]/HiveHome.tsx`:

```typescript
// Add import
import { MobileSocialSheet } from '@/components/social/MobileSocialSheet';

// Add at the end of the component, before closing div:
<MobileSocialSheet
  hiveId={hiveId}
  userId={userId}
  displayName={displayName}
  avatarUrl={avatarUrl}
  initialActivity={initialActivity}
  initialReactions={initialReactions}
  onAddReaction={handleAddReaction}
/>
```

**Step 3: Run linter and tests**

Run: `npm run lint && npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add components/social/MobileSocialSheet.tsx app/hives/\[hiveId\]/HiveHome.tsx
git commit -m "feat: add mobile social sheet for responsive sidebar

- Floating action button on mobile
- Bottom sheet with tabs (presence, activity, reactions)
- Hidden on desktop (lg:hidden)"
```

---

## Task 15: Update Documentation

**Files:**

- Modify: `docs/feature-map.md`
- Modify: `docs/setup/README.md`
- Modify: `supabase/README.md`

**Step 1: Update feature-map.md**

Add section for Welcome Hive flow.

**Step 2: Update setup/README.md**

Add Welcome Hive seeding step.

**Step 3: Update supabase/README.md**

Document new tables.

**Step 4: Commit**

```bash
git add docs/feature-map.md docs/setup/README.md supabase/README.md
git commit -m "docs: update documentation for Welcome Hive feature

- feature-map: add Welcome Hive user flow
- setup: add seed script step
- supabase: document social tables"
```

---

## Final Verification

**Run all checks:**

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

**Manual testing:**

1. Run migrations: `npx supabase db reset`
2. Seed Welcome Hive: `npx tsx scripts/seed-welcome-hive.ts`
3. Start app: `npm run dev`
4. Create new account → verify auto-join to Welcome Hive
5. Visit Welcome Hive → verify social sidebar works
6. Test reactions, presence, activity feed
7. Test mobile view

---

## Summary

| Task                       | Files | Tests |
| -------------------------- | ----- | ----- |
| 1. Social tables migration | 1     | -     |
| 2. System hive column      | 1     | -     |
| 3. Welcome Hive seed       | 2     | -     |
| 4. Auto-join on signup     | 3     | ✓     |
| 5. Activity service        | 3     | ✓     |
| 6. Reactions service       | 2     | ✓     |
| 7. Presence hook           | 2     | ✓     |
| 8. Activity hook           | 1     | -     |
| 9. Reactions hook          | 2     | -     |
| 10. Multi-step card        | 2     | ✓     |
| 11. Sidebar components     | 4     | -     |
| 12. Homepage layout        | 3     | -     |
| 13. Create Hive CTA        | 3     | -     |
| 14. Mobile responsive      | 2     | -     |
| 15. Documentation          | 3     | -     |

**Total: ~34 files, 14 commits**
