# Moderation Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow hive admins to moderate responses with predefined flags, hiding them from the live feed while maintaining an audit trail accessible to all users.

**Architecture:** Add moderation fields to `conversation_responses` table, create a `response_moderation_log` audit table, expose moderate/reinstate/history APIs, and add UI for flagging responses and viewing moderation history.

**Tech Stack:** Next.js 14 (App Router), Supabase (PostgreSQL), Zod validation, Phosphor Icons, TailwindCSS

---

## Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/047_add_moderation_support.sql`

**Step 1: Write the migration**

```sql
-- Migration: Add moderation support to conversation_responses
-- Adds moderation fields and audit log table

-- 1. Create moderation flag enum
CREATE TYPE moderation_flag AS ENUM ('antisocial', 'misleading', 'illegal', 'spam', 'doxing');

-- 2. Add moderation columns to conversation_responses
ALTER TABLE conversation_responses
  ADD COLUMN moderation_flag moderation_flag,
  ADD COLUMN moderated_at TIMESTAMPTZ,
  ADD COLUMN moderated_by UUID REFERENCES profiles(id);

-- 3. Create index for filtering non-moderated responses
CREATE INDEX idx_conversation_responses_moderation_flag
  ON conversation_responses (conversation_id)
  WHERE moderation_flag IS NULL;

-- 4. Create moderation audit log table
CREATE TABLE response_moderation_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  response_id BIGINT NOT NULL REFERENCES conversation_responses(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('moderated', 'reinstated')),
  flag moderation_flag NOT NULL,
  performed_by UUID NOT NULL REFERENCES profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create index for fetching moderation history by conversation
CREATE INDEX idx_response_moderation_log_response_id ON response_moderation_log(response_id);

-- 6. Enable RLS on moderation log
ALTER TABLE response_moderation_log ENABLE ROW LEVEL SECURITY;

-- 7. RLS policy: Anyone can read moderation logs (per design requirement)
CREATE POLICY "response_moderation_log_select" ON response_moderation_log
  FOR SELECT USING (true);

-- 8. RLS policy: Only admins can insert (enforced at API level, but defense in depth)
-- Note: Actual admin check happens in API; this just requires authenticated user
CREATE POLICY "response_moderation_log_insert" ON response_moderation_log
  FOR INSERT WITH CHECK (auth.uid() = performed_by);
```

**Step 2: Run migration locally**

Run: `npx supabase db reset` or `npx supabase migration up`
Expected: Migration applies successfully

**Step 3: Regenerate types**

Run: `npm run db:types`
Expected: Types regenerated with moderation fields

**Step 4: Commit**

```bash
git add supabase/migrations/047_add_moderation_support.sql
git commit -m "feat(db): add moderation support schema"
```

---

## Task 2: TypeScript Types

**Files:**

- Create: `types/moderation.ts`
- Modify: `types/conversations.ts` (add moderation fields to response type)

**Step 1: Create moderation types**

Create `types/moderation.ts`:

```typescript
/**
 * Moderation Types
 *
 * Types for response moderation feature
 */

export const MODERATION_FLAGS = [
  "antisocial",
  "misleading",
  "illegal",
  "spam",
  "doxing",
] as const;

export type ModerationFlag = (typeof MODERATION_FLAGS)[number];

export const MODERATION_FLAG_LABELS: Record<
  ModerationFlag,
  { emoji: string; label: string }
> = {
  antisocial: { emoji: "🤬", label: "Antisocial" },
  misleading: { emoji: "🤥", label: "Misleading" },
  illegal: { emoji: "🚩", label: "Illegal" },
  spam: { emoji: "🗑️", label: "Spam" },
  doxing: { emoji: "🔏", label: "Doxing" },
};

export type ModerationAction = "moderated" | "reinstated";

export interface ModerationLogEntry {
  id: number;
  responseId: number;
  responseText: string;
  action: ModerationAction;
  flag: ModerationFlag;
  performedBy: {
    id: string;
    name: string;
  };
  performedAt: string;
}

export interface ModerationHistoryResponse {
  history: ModerationLogEntry[];
}

export interface ModerateRequestBody {
  flag: ModerationFlag;
}
```

**Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add types/moderation.ts
git commit -m "feat(types): add moderation types"
```

---

## Task 3: Moderate API Endpoint

**Files:**

- Create: `app/api/conversations/[conversationId]/responses/[responseId]/moderate/route.ts`

**Step 1: Create the moderate endpoint**

```typescript
/**
 * Moderate Response API Route
 *
 * POST - Moderate a response (admin only)
 * Sets moderation flag and creates audit log entry
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import { requireHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
import { z } from "zod";
import { MODERATION_FLAGS } from "@/types/moderation";

const moderateSchema = z.object({
  flag: z.enum(MODERATION_FLAGS),
});

type RouteParams = { conversationId: string; responseId: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { conversationId, responseId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Parse response ID
    const numericId = parseInt(responseId, 10);
    if (isNaN(numericId)) {
      return jsonError("Invalid response ID", 400);
    }

    // 3. Fetch response and verify it exists
    const { data: response, error: fetchError } = await supabase
      .from("conversation_responses")
      .select("id, conversation_id, moderation_flag")
      .eq("id", numericId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (fetchError || !response) {
      return jsonError("Response not found", 404);
    }

    // 4. Check if already moderated
    if (response.moderation_flag) {
      return jsonError(
        "Response is already moderated",
        400,
        "ALREADY_MODERATED"
      );
    }

    // 5. Get conversation to find hive_id
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 6. Verify admin access
    await requireHiveAdmin(supabase, session.user.id, conversation.hive_id);

    // 7. Validate request body
    const body = await req.json();
    const validation = moderateSchema.safeParse(body);

    if (!validation.success) {
      return jsonError("Invalid request body", 400, "INVALID_INPUT");
    }

    const { flag } = validation.data;
    const now = new Date().toISOString();

    // 8. Update response with moderation flag
    const { error: updateError } = await supabase
      .from("conversation_responses")
      .update({
        moderation_flag: flag,
        moderated_at: now,
        moderated_by: session.user.id,
      })
      .eq("id", numericId);

    if (updateError) {
      console.error("[POST moderate] Update error:", updateError);
      return jsonError("Failed to moderate response", 500);
    }

    // 9. Create audit log entry
    const { error: logError } = await supabase
      .from("response_moderation_log")
      .insert({
        response_id: numericId,
        action: "moderated",
        flag,
        performed_by: session.user.id,
        performed_at: now,
      });

    if (logError) {
      console.error("[POST moderate] Log error:", logError);
      // Don't fail the request, moderation already applied
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return jsonError("Forbidden: Admin access required", 403);
    }
    console.error("[POST moderate] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
```

**Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add app/api/conversations/[conversationId]/responses/[responseId]/moderate/route.ts
git commit -m "feat(api): add moderate response endpoint"
```

---

## Task 4: Reinstate API Endpoint

**Files:**

- Create: `app/api/conversations/[conversationId]/responses/[responseId]/reinstate/route.ts`

**Step 1: Create the reinstate endpoint**

```typescript
/**
 * Reinstate Response API Route
 *
 * POST - Reinstate a moderated response (admin only)
 * Clears moderation flag and creates audit log entry
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import { requireHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";

type RouteParams = { conversationId: string; responseId: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { conversationId, responseId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Parse response ID
    const numericId = parseInt(responseId, 10);
    if (isNaN(numericId)) {
      return jsonError("Invalid response ID", 400);
    }

    // 3. Fetch response and verify it exists and is moderated
    const { data: response, error: fetchError } = await supabase
      .from("conversation_responses")
      .select("id, conversation_id, moderation_flag")
      .eq("id", numericId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (fetchError || !response) {
      return jsonError("Response not found", 404);
    }

    // 4. Check if currently moderated
    if (!response.moderation_flag) {
      return jsonError("Response is not moderated", 400, "NOT_MODERATED");
    }

    const originalFlag = response.moderation_flag;

    // 5. Get conversation to find hive_id
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 6. Verify admin access
    await requireHiveAdmin(supabase, session.user.id, conversation.hive_id);

    const now = new Date().toISOString();

    // 7. Clear moderation fields
    const { error: updateError } = await supabase
      .from("conversation_responses")
      .update({
        moderation_flag: null,
        moderated_at: null,
        moderated_by: null,
      })
      .eq("id", numericId);

    if (updateError) {
      console.error("[POST reinstate] Update error:", updateError);
      return jsonError("Failed to reinstate response", 500);
    }

    // 8. Create audit log entry with original flag
    const { error: logError } = await supabase
      .from("response_moderation_log")
      .insert({
        response_id: numericId,
        action: "reinstated",
        flag: originalFlag,
        performed_by: session.user.id,
        performed_at: now,
      });

    if (logError) {
      console.error("[POST reinstate] Log error:", logError);
      // Don't fail the request, reinstatement already applied
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return jsonError("Forbidden: Admin access required", 403);
    }
    console.error("[POST reinstate] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
```

**Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add app/api/conversations/[conversationId]/responses/[responseId]/reinstate/route.ts
git commit -m "feat(api): add reinstate response endpoint"
```

---

## Task 5: Moderation History API Endpoint

**Files:**

- Create: `app/api/conversations/[conversationId]/moderation/route.ts`

**Step 1: Create the moderation history endpoint**

```typescript
/**
 * Moderation History API Route
 *
 * GET - Fetch moderation history for a conversation (any authenticated user)
 * Returns all moderation log entries with response text and admin info
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { jsonError } from "@/lib/api/errors";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import type {
  ModerationLogEntry,
  ModerationHistoryResponse,
} from "@/types/moderation";

type RouteParams = { conversationId: string };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { conversationId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorised: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Get conversation to find hive_id
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("hive_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 3. Verify membership (anyone in the hive can view moderation history)
    await requireHiveMember(supabase, session.user.id, conversation.hive_id);

    // 4. Fetch moderation log entries with response text and admin profile
    const { data: logs, error: logsError } = await supabase
      .from("response_moderation_log")
      .select(
        `
        id,
        response_id,
        action,
        flag,
        performed_at,
        performed_by,
        conversation_responses!inner(
          id,
          response_text,
          conversation_id
        ),
        profiles!response_moderation_log_performed_by_fkey(
          id,
          display_name
        )
      `
      )
      .eq("conversation_responses.conversation_id", conversationId)
      .order("performed_at", { ascending: false });

    if (logsError) {
      console.error("[GET moderation] Logs error:", logsError);
      return jsonError("Failed to fetch moderation history", 500);
    }

    // 5. Transform to response format
    const history: ModerationLogEntry[] = (logs || []).map((log) => {
      const response = log.conversation_responses as unknown as {
        id: number;
        response_text: string;
      };
      const profile = log.profiles as unknown as {
        id: string;
        display_name: string | null;
      } | null;

      return {
        id: Number(log.id),
        responseId: response.id,
        responseText: response.response_text,
        action: log.action as "moderated" | "reinstated",
        flag: log.flag,
        performedBy: {
          id: log.performed_by,
          name: profile?.display_name || "Admin",
        },
        performedAt: log.performed_at,
      };
    });

    const response: ModerationHistoryResponse = { history };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return jsonError("Forbidden: Membership required", 403);
    }
    console.error("[GET moderation] Error:", error);
    return jsonError("Internal server error", 500);
  }
}
```

**Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add app/api/conversations/[conversationId]/moderation/route.ts
git commit -m "feat(api): add moderation history endpoint"
```

---

## Task 6: Update Responses API to Filter Moderated

**Files:**

- Modify: `app/api/conversations/[conversationId]/responses/route.ts`

**Step 1: Read current implementation**

Read the file to understand current query structure.

**Step 2: Add moderation filter**

In the GET handler, add `.is("moderation_flag", null)` to the query:

```typescript
// In the existing SELECT query, add the filter:
const { data: responses, error } = await supabase
  .from("conversation_responses")
  .select("...")
  .eq("conversation_id", conversationId)
  .is("moderation_flag", null) // ADD THIS LINE
  .order("created_at", { ascending: false });
```

**Step 3: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors

**Step 4: Commit**

```bash
git add app/api/conversations/[conversationId]/responses/route.ts
git commit -m "feat(api): filter moderated responses from feed"
```

---

## Task 7: ModerationFlagMenu Component

**Files:**

- Create: `app/components/conversation/ModerationFlagMenu.tsx`

**Step 1: Create the component**

```typescript
/**
 * ModerationFlagMenu - Popover menu for selecting moderation flags
 *
 * Displays 5 flag options as icon buttons
 * Triggers onSelect callback when a flag is chosen
 */

"use client";

import { useEffect, useRef } from "react";
import { MODERATION_FLAGS, MODERATION_FLAG_LABELS, type ModerationFlag } from "@/types/moderation";

interface ModerationFlagMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (flag: ModerationFlag) => void;
  isLoading?: boolean;
}

export default function ModerationFlagMenu({
  isOpen,
  onClose,
  onSelect,
  isLoading = false,
}: ModerationFlagMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 flex gap-1"
    >
      {MODERATION_FLAGS.map((flag) => {
        const { emoji, label } = MODERATION_FLAG_LABELS[flag];
        return (
          <button
            key={flag}
            type="button"
            onClick={() => onSelect(flag)}
            disabled={isLoading}
            title={label}
            className="w-9 h-9 flex items-center justify-center text-lg hover:bg-slate-100 rounded transition disabled:opacity-50"
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add app/components/conversation/ModerationFlagMenu.tsx
git commit -m "feat(ui): add ModerationFlagMenu component"
```

---

## Task 8: Add Moderate Button to ListenView

**Files:**

- Modify: `app/components/conversation/ListenView.tsx`

**Step 1: Add imports and props**

Add to imports:

```typescript
import { Flag } from "@phosphor-icons/react";
import ModerationFlagMenu from "@/app/components/conversation/ModerationFlagMenu";
import type { ModerationFlag } from "@/types/moderation";
```

Add to props interface:

```typescript
export interface ListenViewProps {
  // ... existing props
  isAdmin?: boolean;
}
```

**Step 2: Add moderation state and handler**

Inside the component, add:

```typescript
// Moderation state
const [moderatingId, setModeratingId] = useState<string | null>(null);
const [isModerating, setIsModerating] = useState(false);

// Moderate a response
const moderateResponse = async (responseId: string, flag: ModerationFlag) => {
  setIsModerating(true);

  try {
    const res = await fetch(
      `/api/conversations/${conversationId}/responses/${responseId}/moderate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag }),
      }
    );

    if (!res.ok) {
      const data = await res.json();
      console.error("Moderate failed:", data.error);
      return;
    }

    // Refresh feed to remove moderated response
    silentRefresh();
    setModeratingId(null);
  } catch (err) {
    console.error("Moderate failed:", err);
  } finally {
    setIsModerating(false);
  }
};
```

**Step 3: Add moderate button to response row**

In the response rendering section (around line 600), after the edit/delete buttons and before the like button, add:

```typescript
{/* Moderate button for admins */}
{!isGuest && isAdmin && editingId !== resp.id && (
  <div className="relative">
    <button
      type="button"
      onClick={() => setModeratingId(moderatingId === resp.id ? null : resp.id)}
      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition"
      title="Moderate"
    >
      <Flag size={16} />
    </button>
    <ModerationFlagMenu
      isOpen={moderatingId === resp.id}
      onClose={() => setModeratingId(null)}
      onSelect={(flag) => moderateResponse(resp.id, flag)}
      isLoading={isModerating}
    />
  </div>
)}
```

**Step 4: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors

**Step 5: Commit**

```bash
git add app/components/conversation/ListenView.tsx
git commit -m "feat(ui): add moderate button to response feed"
```

---

## Task 9: Pass isAdmin to ListenView

**Files:**

- Modify: `app/hives/[hiveId]/conversations/[conversationId]/listen/page.tsx`

**Step 1: Import authorizeHiveAdmin**

```typescript
import { authorizeHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
```

**Step 2: Check admin status**

After the membership check, add:

```typescript
// 3c. Check if user is admin
const isAdmin = await authorizeHiveAdmin(supabase, session.user.id, hive.id);
```

**Step 3: Pass to component**

Add `isAdmin={isAdmin}` prop to ListenView.

**Step 4: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors

**Step 5: Commit**

```bash
git add app/hives/[hiveId]/conversations/[conversationId]/listen/page.tsx
git commit -m "feat: pass isAdmin prop to ListenView"
```

---

## Task 10: Add Moderation History Link to ConversationHeader

**Files:**

- Modify: `app/components/conversation/ConversationHeader.tsx`

**Step 1: Add import**

```typescript
import { ClockCounterClockwise } from "@phosphor-icons/react";
```

**Step 2: Add menu item in mobile dropdown (around line 279)**

After the Share button, add:

```typescript
<Button
  variant="ghost"
  size="sm"
  className="w-full justify-start rounded-lg px-3 py-2 text-left text-body text-text-primary hover:bg-slate-50"
  onClick={() => {
    setMenuOpen(false);
    router.push(`${basePath}/moderation`);
  }}
>
  <span className="flex items-center gap-2">
    <ClockCounterClockwise size={16} />
    Moderation History
  </span>
</Button>
```

**Step 3: Add menu item in desktop dropdown (around line 390)**

Add same button before the admin-only actions.

**Step 4: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors

**Step 5: Commit**

```bash
git add app/components/conversation/ConversationHeader.tsx
git commit -m "feat(ui): add Moderation History link to header menu"
```

---

## Task 11: Moderation History Page

**Files:**

- Create: `app/hives/[hiveId]/conversations/[conversationId]/moderation/page.tsx`

**Step 1: Create the page**

```typescript
/**
 * Moderation History Page - Server Component
 *
 * Displays moderation history for a conversation
 * Accessible to all hive members, reinstate available to admins only
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveAndConversation } from "@/lib/conversations/server/resolveHiveAndConversation";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { authorizeHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
import ConversationHeader from "@/app/components/conversation/ConversationHeader";
import ModerationHistoryView from "@/app/components/conversation/ModerationHistoryView";

interface ModerationPageProps {
  params: Promise<{
    hiveId: string;
    conversationId: string;
  }>;
}

export default async function ModerationPage({ params }: ModerationPageProps) {
  const { hiveId: hiveKey, conversationId: conversationKey } = await params;

  // 1. Verify authentication
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = await supabaseServerClient();

  // 2. Resolve hive and conversation
  const { hive, conversation } = await resolveHiveAndConversation(
    supabase,
    hiveKey,
    conversationKey
  );

  // 3. Verify membership
  await requireHiveMember(supabase, session.user.id, hive.id);

  // 4. Check admin status
  const isAdmin = await authorizeHiveAdmin(supabase, session.user.id, hive.id);

  return (
    <>
      <ConversationHeader
        conversationId={conversation.id}
        hiveKey={hive.slug || hive.id}
        conversationKey={conversation.slug || conversation.id}
        title={conversation.title}
        description={conversation.description}
        conversationType={conversation.type as "understand" | "decide"}
        isAdmin={isAdmin}
      />
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-6">
        <ModerationHistoryView
          conversationId={conversation.id}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}
```

**Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors (will fail until Task 12 creates ModerationHistoryView)

**Step 3: Commit (after Task 12)**

```bash
git add app/hives/[hiveId]/conversations/[conversationId]/moderation/page.tsx
git commit -m "feat(ui): add moderation history page"
```

---

## Task 12: ModerationHistoryView Component

**Files:**

- Create: `app/components/conversation/ModerationHistoryView.tsx`

**Step 1: Create the component**

```typescript
/**
 * ModerationHistoryView - Client Component
 *
 * Displays moderation history grouped by flag category
 * Admins can reinstate moderated responses
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import ConfirmationModal from "@/app/components/ConfirmationModal";
import {
  MODERATION_FLAGS,
  MODERATION_FLAG_LABELS,
  type ModerationFlag,
  type ModerationLogEntry,
} from "@/types/moderation";

interface ModerationHistoryViewProps {
  conversationId: string;
  isAdmin: boolean;
}

export default function ModerationHistoryView({
  conversationId,
  isAdmin,
}: ModerationHistoryViewProps) {
  const [history, setHistory] = useState<ModerationLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reinstateId, setReinstateId] = useState<number | null>(null);
  const [isReinstating, setIsReinstating] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/moderation`);
      if (!res.ok) {
        throw new Error("Failed to fetch moderation history");
      }
      const data = await res.json();
      setHistory(data.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const reinstateResponse = async () => {
    if (!reinstateId) return;

    // Find the response ID from the log entry
    const logEntry = history.find((h) => h.id === reinstateId);
    if (!logEntry) return;

    setIsReinstating(true);

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/responses/${logEntry.responseId}/reinstate`,
        { method: "POST" }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reinstate");
      }

      // Refresh history
      await fetchHistory();
      setReinstateId(null);
    } catch (err) {
      console.error("Reinstate failed:", err);
    } finally {
      setIsReinstating(false);
    }
  };

  // Group history by flag, showing latest action per response
  const groupedByFlag = MODERATION_FLAGS.reduce(
    (acc, flag) => {
      // Get all entries for this flag
      const entriesForFlag = history.filter((h) => h.flag === flag);

      // Group by responseId, keeping all entries (for showing reinstatement status)
      const byResponseId = new Map<number, ModerationLogEntry[]>();
      entriesForFlag.forEach((entry) => {
        const existing = byResponseId.get(entry.responseId) || [];
        existing.push(entry);
        byResponseId.set(entry.responseId, existing);
      });

      // For each response, determine if it's currently reinstated
      const processedEntries: Array<{
        entry: ModerationLogEntry;
        isReinstated: boolean;
        reinstatedAt?: string;
      }> = [];

      byResponseId.forEach((entries) => {
        // Sort by performed_at descending
        const sorted = [...entries].sort(
          (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()
        );

        const latestAction = sorted[0];
        const isReinstated = latestAction.action === "reinstated";

        // Find the original moderation entry
        const moderationEntry = sorted.find((e) => e.action === "moderated");
        if (moderationEntry) {
          processedEntries.push({
            entry: moderationEntry,
            isReinstated,
            reinstatedAt: isReinstated ? latestAction.performedAt : undefined,
          });
        }
      });

      if (processedEntries.length > 0) {
        acc[flag] = processedEntries;
      }

      return acc;
    },
    {} as Record<ModerationFlag, Array<{
      entry: ModerationLogEntry;
      isReinstated: boolean;
      reinstatedAt?: string;
    }>>
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-h3 text-text-primary">Moderation History</h2>
        <div className="h-32 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-h3 text-text-primary">Moderation History</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const hasAnyEntries = Object.keys(groupedByFlag).length > 0;

  return (
    <div className="space-y-6">
      <h2 className="text-h3 text-text-primary">Moderation History</h2>

      {!hasAnyEntries ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center text-slate-600">
          No moderated responses yet.
        </div>
      ) : (
        <div className="space-y-8">
          {MODERATION_FLAGS.map((flag) => {
            const entries = groupedByFlag[flag];
            if (!entries || entries.length === 0) return null;

            const { emoji, label } = MODERATION_FLAG_LABELS[flag];

            return (
              <div key={flag} className="space-y-3">
                <h3 className="text-h4 text-text-primary flex items-center gap-2">
                  <span>{emoji}</span>
                  <span>{label}</span>
                  <span className="text-slate-400 font-normal">({entries.length})</span>
                </h3>

                <div className="space-y-3">
                  {entries.map(({ entry, isReinstated, reinstatedAt }) => (
                    <div
                      key={entry.id}
                      className={`bg-white border rounded-lg p-4 ${
                        isReinstated ? "border-slate-200 opacity-75" : "border-slate-300"
                      }`}
                    >
                      <p className="text-body text-text-primary mb-2">
                        {entry.responseText}
                      </p>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3 text-info text-slate-500">
                          <span>
                            Moderated {formatDate(entry.performedAt)}
                          </span>
                          <span>by {entry.performedBy.name}</span>
                          {isReinstated && reinstatedAt && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                              Reinstated {formatDate(reinstatedAt)}
                            </span>
                          )}
                        </div>
                        {isAdmin && !isReinstated && (
                          <button
                            type="button"
                            onClick={() => setReinstateId(entry.id)}
                            className="flex items-center gap-1 text-info text-indigo-600 hover:text-indigo-700 transition"
                          >
                            <ArrowCounterClockwise size={14} />
                            Reinstate
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationModal
        isOpen={reinstateId !== null}
        title="Reinstate response?"
        message="Are you sure you want to reinstate this opinion? It will reappear in the live feed."
        confirmLabel="Reinstate"
        cancelLabel="Cancel"
        onConfirm={reinstateResponse}
        onCancel={() => setReinstateId(null)}
        isLoading={isReinstating}
      />
    </div>
  );
}
```

**Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add app/components/conversation/ModerationHistoryView.tsx app/hives/[hiveId]/conversations/[conversationId]/moderation/page.tsx
git commit -m "feat(ui): add moderation history page and view component"
```

---

## Task 13: Run Full Test Suite

**Step 1: Run linting**

Run: `npm run lint`
Expected: No errors

**Step 2: Run type checking**

Run: `npm run typecheck`
Expected: No type errors

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

---

## Task 14: Manual Testing Checklist

Test the following scenarios manually:

1. **As admin:** Hover over a response in the feed → see Flag button
2. **As admin:** Click Flag button → see 5 emoji options
3. **As admin:** Select a flag → response disappears from feed, toast shows
4. **As non-admin:** Hover over response → no Flag button visible
5. **As any user:** Click ellipsis menu → see "Moderation History" option
6. **As any user:** Visit moderation history page → see grouped entries
7. **As admin on history page:** Click "Reinstate" → confirmation modal
8. **As admin:** Confirm reinstate → response returns to feed, history shows "Reinstated" tag
9. **As non-admin on history page:** No "Reinstate" button visible

---

## Task 15: Documentation Update

**Files:**

- Modify: `lib/conversations/README.md`
- Modify: `docs/feature-map.md`

**Step 1: Update conversations README**

Add a "Moderation" section documenting:

- How moderation works
- API endpoints
- Admin requirements
- Audit trail behaviour

**Step 2: Update feature-map**

Add moderation to the feature map with file pointers.

**Step 3: Commit**

```bash
git add lib/conversations/README.md docs/feature-map.md
git commit -m "docs: add moderation feature documentation"
```
