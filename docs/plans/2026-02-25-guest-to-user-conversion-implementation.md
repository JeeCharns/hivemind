# Guest-to-User Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When guests sign up after participating via share links, automatically migrate their contributions to their new account with user-chosen attribution.

**Architecture:** After OTP verification, check for guest session cookie → call API to check migration eligibility → show modal for attribution choice → execute migration server-side → auto-join hives → redirect to dashboard.

**Tech Stack:** Next.js API routes, Supabase (admin client), React modal component, Zod validation.

---

## Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/044_guest_session_conversion.sql`

**Step 1: Write the migration SQL**

```sql
-- Add conversion tracking columns to guest_sessions
ALTER TABLE guest_sessions
ADD COLUMN converted_to_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN converted_at TIMESTAMPTZ;

-- Index for efficient lookup of unconverted sessions
CREATE INDEX idx_guest_sessions_unconverted
ON guest_sessions(session_token_hash)
WHERE converted_to_user_id IS NULL;

COMMENT ON COLUMN guest_sessions.converted_to_user_id IS 'User ID this guest session was converted to, if any';
COMMENT ON COLUMN guest_sessions.converted_at IS 'Timestamp when the session was converted to a user account';
```

**Step 2: Apply migration locally**

Run: `npm run db:migrate` or `npx supabase db push`
Expected: Migration applies successfully

**Step 3: Commit**

```bash
git add supabase/migrations/044_guest_session_conversion.sql
git commit -m "feat(db): add guest session conversion tracking columns"
```

---

## Task 2: Guest Session Service Extension

**Files:**

- Modify: `lib/conversations/guest/guestSessionService.ts`
- Test: `lib/conversations/guest/__tests__/guestSessionService.test.ts`

**Step 1: Add type for convertible session**

Add to `guestSessionService.ts` after existing types:

```typescript
export interface ConvertibleGuestSession {
  guestSessionId: string;
  guestNumber: number;
  conversationId: string;
  conversationTitle: string | null;
  hiveId: string;
  hiveKey: string;
}
```

**Step 2: Write failing test for getConvertibleGuestSession**

Add to `__tests__/guestSessionService.test.ts`:

```typescript
describe("getConvertibleGuestSession", () => {
  it("returns session data when cookie valid and not converted", async () => {
    mockCookies.mockResolvedValue({
      get: () => ({ value: "valid-token" }),
    });

    const mockClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: "gs-001",
          guest_number: 5,
          converted_to_user_id: null,
          conversation_share_links: {
            conversations: {
              id: "conv-001",
              title: "Workshop",
              hives: { id: "hive-001", key: "team-hive" },
            },
          },
        },
        error: null,
      }),
    };

    const result = await getConvertibleGuestSession(mockClient as any);
    expect(result).toEqual({
      guestSessionId: "gs-001",
      guestNumber: 5,
      conversationId: "conv-001",
      conversationTitle: "Workshop",
      hiveId: "hive-001",
      hiveKey: "team-hive",
    });
  });

  it("returns null when session already converted", async () => {
    mockCookies.mockResolvedValue({
      get: () => ({ value: "valid-token" }),
    });

    const mockClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      }),
    };

    const result = await getConvertibleGuestSession(mockClient as any);
    expect(result).toBeNull();
  });

  it("returns null when no cookie present", async () => {
    mockCookies.mockResolvedValue({
      get: () => undefined,
    });

    const result = await getConvertibleGuestSession({} as any);
    expect(result).toBeNull();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test -- lib/conversations/guest/__tests__/guestSessionService.test.ts`
Expected: FAIL - `getConvertibleGuestSession` is not defined

**Step 4: Implement getConvertibleGuestSession**

Add to `guestSessionService.ts`:

```typescript
/**
 * Get a guest session that can be converted to a user account.
 * Returns null if no valid unconverted session exists.
 */
export async function getConvertibleGuestSession(
  adminClient: SupabaseClient
): Promise<ConvertibleGuestSession | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(GUEST_SESSION_COOKIE)?.value;

  if (!rawToken) {
    return null;
  }

  const tokenHash = hashToken(rawToken);

  const { data, error } = await adminClient
    .from("guest_sessions")
    .select(
      `
      id,
      guest_number,
      converted_to_user_id,
      conversation_share_links!guest_sessions_share_link_id_fkey (
        conversations!conversation_share_links_conversation_id_fkey (
          id,
          title,
          hives!conversations_hive_id_fkey (
            id,
            key
          )
        )
      )
    `
    )
    .eq("session_token_hash", tokenHash)
    .is("converted_to_user_id", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) {
    return null;
  }

  // Type the joined data
  interface JoinedData {
    id: string;
    guest_number: number;
    converted_to_user_id: string | null;
    conversation_share_links: {
      conversations: {
        id: string;
        title: string | null;
        hives: { id: string; key: string } | null;
      } | null;
    } | null;
  }

  const typed = data as unknown as JoinedData;
  const conv = typed.conversation_share_links?.conversations;
  const hive = conv?.hives;

  if (!conv || !hive) {
    return null;
  }

  return {
    guestSessionId: typed.id,
    guestNumber: typed.guest_number,
    conversationId: conv.id,
    conversationTitle: conv.title,
    hiveId: hive.id,
    hiveKey: hive.key,
  };
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- lib/conversations/guest/__tests__/guestSessionService.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/conversations/guest/guestSessionService.ts lib/conversations/guest/__tests__/guestSessionService.test.ts
git commit -m "feat(guest): add getConvertibleGuestSession helper"
```

---

## Task 3: Migration Service

**Files:**

- Create: `lib/auth/server/migrateGuestSession.ts`
- Create: `lib/auth/server/__tests__/migrateGuestSession.test.ts`

**Step 1: Write the test file**

```typescript
/**
 * @jest-environment node
 */

import { migrateGuestSession } from "../migrateGuestSession";

describe("migrateGuestSession", () => {
  const mockRpc = jest.fn();
  const mockFrom = jest.fn();
  const mockUpdate = jest.fn();
  const mockEq = jest.fn();
  const mockSelect = jest.fn();

  const mockClient = {
    rpc: mockRpc,
    from: jest.fn(() => ({
      update: mockUpdate.mockReturnValue({
        eq: mockEq.mockReturnValue({
          select: mockSelect,
        }),
      }),
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("migrates responses, likes, feedback and joins hives", async () => {
    mockRpc.mockResolvedValue({
      data: {
        responses_count: 3,
        likes_count: 5,
        feedback_count: 8,
        hive_ids: ["hive-001", "hive-002"],
      },
      error: null,
    });

    const result = await migrateGuestSession(mockClient as any, {
      userId: "user-123",
      guestSessionId: "gs-001",
      keepAnonymous: false,
    });

    expect(mockRpc).toHaveBeenCalledWith("migrate_guest_session", {
      p_user_id: "user-123",
      p_guest_session_id: "gs-001",
      p_keep_anonymous: false,
    });

    expect(result).toEqual({
      responsesCount: 3,
      likesCount: 5,
      feedbackCount: 8,
      hiveIds: ["hive-001", "hive-002"],
    });
  });

  it("throws on database error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Database error" },
    });

    await expect(
      migrateGuestSession(mockClient as any, {
        userId: "user-123",
        guestSessionId: "gs-001",
        keepAnonymous: true,
      })
    ).rejects.toThrow("Failed to migrate guest session");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/auth/server/__tests__/migrateGuestSession.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the service**

Create `lib/auth/server/migrateGuestSession.ts`:

```typescript
/**
 * Guest Session Migration Service
 *
 * Migrates guest contributions (responses, likes, feedback) to a user account.
 * Also auto-joins the user to relevant hives.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface MigrateGuestSessionParams {
  userId: string;
  guestSessionId: string;
  keepAnonymous: boolean;
}

export interface MigrateGuestSessionResult {
  responsesCount: number;
  likesCount: number;
  feedbackCount: number;
  hiveIds: string[];
}

/**
 * Migrate a guest session to a user account.
 * Updates all responses, likes, and feedback to the new user_id.
 * Auto-joins the user to all hives they participated in.
 */
export async function migrateGuestSession(
  adminClient: SupabaseClient,
  params: MigrateGuestSessionParams
): Promise<MigrateGuestSessionResult> {
  const { userId, guestSessionId, keepAnonymous } = params;

  const { data, error } = await adminClient.rpc("migrate_guest_session", {
    p_user_id: userId,
    p_guest_session_id: guestSessionId,
    p_keep_anonymous: keepAnonymous,
  });

  if (error || !data) {
    console.error("[migrateGuestSession] Failed:", error);
    throw new Error("Failed to migrate guest session");
  }

  console.log(
    `[guest-migration] Migrated session ${guestSessionId} to user ${userId}: ` +
      `${data.responses_count} responses, ${data.likes_count} likes, ${data.feedback_count} feedback`
  );

  return {
    responsesCount: data.responses_count,
    likesCount: data.likes_count,
    feedbackCount: data.feedback_count,
    hiveIds: data.hive_ids || [],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/auth/server/__tests__/migrateGuestSession.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/auth/server/migrateGuestSession.ts lib/auth/server/__tests__/migrateGuestSession.test.ts
git commit -m "feat(auth): add migrateGuestSession service"
```

---

## Task 4: Database Function for Migration

**Files:**

- Modify: `supabase/migrations/044_guest_session_conversion.sql`

**Step 1: Add the RPC function to the migration**

Append to the migration file:

```sql
-- Function to migrate guest session to user account (atomic transaction)
CREATE OR REPLACE FUNCTION migrate_guest_session(
  p_user_id UUID,
  p_guest_session_id UUID,
  p_keep_anonymous BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_responses_count INTEGER;
  v_likes_count INTEGER;
  v_feedback_count INTEGER;
  v_hive_ids UUID[];
BEGIN
  -- 1. Update responses
  UPDATE conversation_responses
  SET user_id = p_user_id,
      guest_session_id = NULL,
      is_anonymous = p_keep_anonymous
  WHERE guest_session_id = p_guest_session_id;

  GET DIAGNOSTICS v_responses_count = ROW_COUNT;

  -- 2. Update likes
  UPDATE response_likes
  SET user_id = p_user_id,
      guest_session_id = NULL
  WHERE guest_session_id = p_guest_session_id;

  GET DIAGNOSTICS v_likes_count = ROW_COUNT;

  -- 3. Update feedback
  UPDATE response_feedback
  SET user_id = p_user_id,
      guest_session_id = NULL
  WHERE guest_session_id = p_guest_session_id;

  GET DIAGNOSTICS v_feedback_count = ROW_COUNT;

  -- 4. Get unique hive IDs from migrated responses
  SELECT ARRAY_AGG(DISTINCT c.hive_id)
  INTO v_hive_ids
  FROM conversation_responses cr
  JOIN conversations c ON c.id = cr.conversation_id
  WHERE cr.user_id = p_user_id
    AND cr.guest_session_id IS NULL;

  -- 5. Auto-join hives
  INSERT INTO hive_members (hive_id, user_id, role)
  SELECT UNNEST(v_hive_ids), p_user_id, 'member'
  ON CONFLICT (hive_id, user_id) DO NOTHING;

  -- 6. Mark session as converted
  UPDATE guest_sessions
  SET converted_to_user_id = p_user_id,
      converted_at = now()
  WHERE id = p_guest_session_id;

  RETURN json_build_object(
    'responses_count', v_responses_count,
    'likes_count', v_likes_count,
    'feedback_count', v_feedback_count,
    'hive_ids', COALESCE(v_hive_ids, ARRAY[]::UUID[])
  );
END;
$$;

COMMENT ON FUNCTION migrate_guest_session IS 'Atomically migrate guest session data to a user account';
```

**Step 2: Re-apply migration**

Run: `npm run db:migrate` or reset and re-apply
Expected: Function created successfully

**Step 3: Commit**

```bash
git add supabase/migrations/044_guest_session_conversion.sql
git commit -m "feat(db): add migrate_guest_session RPC function"
```

---

## Task 5: Check Migration API Endpoint

**Files:**

- Create: `app/api/auth/guest-migration/check/route.ts`
- Create: `app/tests/api/auth/guest-migration-check.test.ts`

**Step 1: Write the test**

```typescript
/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/adminClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/conversations/guest/guestSessionService");

import { GET } from "@/app/api/auth/guest-migration/check/route";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { getConvertibleGuestSession } from "@/lib/conversations/guest/guestSessionService";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockGetConvertible = getConvertibleGuestSession as jest.MockedFunction<
  typeof getConvertibleGuestSession
>;
const mockAdminClient = supabaseAdminClient as jest.MockedFunction<
  typeof supabaseAdminClient
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminClient.mockReturnValue({} as any);
});

describe("GET /api/auth/guest-migration/check", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns hasGuestSession: false when no convertible session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-123" } } as any);
    mockGetConvertible.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasGuestSession).toBe(false);
  });

  it("returns session info when convertible session exists", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-123" } } as any);
    mockGetConvertible.mockResolvedValue({
      guestSessionId: "gs-001",
      guestNumber: 5,
      conversationId: "conv-001",
      conversationTitle: "Workshop",
      hiveId: "hive-001",
      hiveKey: "team-hive",
    });

    // Mock count queries
    mockAdminClient.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest
              .fn()
              .mockResolvedValue({ data: { count: 3 }, error: null }),
          }),
        }),
      }),
    } as any);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasGuestSession).toBe(true);
    expect(body.guestNumber).toBe(5);
    expect(body.conversationTitle).toBe("Workshop");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- app/tests/api/auth/guest-migration-check.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the route**

Create `app/api/auth/guest-migration/check/route.ts`:

```typescript
/**
 * Guest Migration Check API
 *
 * GET /api/auth/guest-migration/check
 *
 * Checks if the authenticated user has an active guest session that can be migrated.
 * Returns session info including counts of contributions.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { getConvertibleGuestSession } from "@/lib/conversations/guest/guestSessionService";
import { jsonError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized", 401);
    }

    const adminClient = supabaseAdminClient();
    const guestSession = await getConvertibleGuestSession(adminClient);

    if (!guestSession) {
      return NextResponse.json({ hasGuestSession: false });
    }

    // Get contribution counts
    const [responsesResult, likesResult, feedbackResult] = await Promise.all([
      adminClient
        .from("conversation_responses")
        .select("id", { count: "exact", head: true })
        .eq("guest_session_id", guestSession.guestSessionId),
      adminClient
        .from("response_likes")
        .select("id", { count: "exact", head: true })
        .eq("guest_session_id", guestSession.guestSessionId),
      adminClient
        .from("response_feedback")
        .select("id", { count: "exact", head: true })
        .eq("guest_session_id", guestSession.guestSessionId),
    ]);

    return NextResponse.json({
      hasGuestSession: true,
      guestSessionId: guestSession.guestSessionId,
      guestNumber: guestSession.guestNumber,
      conversationTitle: guestSession.conversationTitle,
      hiveKey: guestSession.hiveKey,
      responsesCount: responsesResult.count ?? 0,
      likesCount: likesResult.count ?? 0,
      feedbackCount: feedbackResult.count ?? 0,
    });
  } catch (err) {
    console.error("[GET /api/auth/guest-migration/check]", err);
    return jsonError("Internal server error", 500);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- app/tests/api/auth/guest-migration-check.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/api/auth/guest-migration/check/route.ts app/tests/api/auth/guest-migration-check.test.ts
git commit -m "feat(api): add guest migration check endpoint"
```

---

## Task 6: Execute Migration API Endpoint

**Files:**

- Create: `app/api/auth/guest-migration/execute/route.ts`
- Create: `app/tests/api/auth/guest-migration-execute.test.ts`

**Step 1: Write the test**

```typescript
/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/adminClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/conversations/guest/guestSessionService");
jest.mock("@/lib/auth/server/migrateGuestSession");

import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/guest-migration/execute/route";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import {
  getConvertibleGuestSession,
  clearGuestSessionCookie,
} from "@/lib/conversations/guest/guestSessionService";
import { migrateGuestSession } from "@/lib/auth/server/migrateGuestSession";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockGetConvertible = getConvertibleGuestSession as jest.MockedFunction<
  typeof getConvertibleGuestSession
>;
const mockMigrate = migrateGuestSession as jest.MockedFunction<
  typeof migrateGuestSession
>;
const mockAdminClient = supabaseAdminClient as jest.MockedFunction<
  typeof supabaseAdminClient
>;
const mockClearCookie = clearGuestSessionCookie as jest.MockedFunction<
  typeof clearGuestSessionCookie
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminClient.mockReturnValue({} as any);
  mockClearCookie.mockResolvedValue(undefined);
});

function createRequest(body: object): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/auth/guest-migration/execute",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/auth/guest-migration/execute", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(createRequest({ keepAnonymous: false }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when no convertible session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-123" } } as any);
    mockGetConvertible.mockResolvedValue(null);

    const res = await POST(createRequest({ keepAnonymous: false }));
    expect(res.status).toBe(404);
  });

  it("executes migration and clears cookie", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-123" } } as any);
    mockGetConvertible.mockResolvedValue({
      guestSessionId: "gs-001",
      guestNumber: 5,
      conversationId: "conv-001",
      conversationTitle: "Workshop",
      hiveId: "hive-001",
      hiveKey: "team-hive",
    });
    mockMigrate.mockResolvedValue({
      responsesCount: 3,
      likesCount: 5,
      feedbackCount: 8,
      hiveIds: ["hive-001"],
    });

    const res = await POST(createRequest({ keepAnonymous: false }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.migrated).toBe(true);
    expect(body.responsesCount).toBe(3);
    expect(body.redirectTo).toBe("/hives/team-hive");

    expect(mockMigrate).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-123",
      guestSessionId: "gs-001",
      keepAnonymous: false,
    });
    expect(mockClearCookie).toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-123" } } as any);

    const res = await POST(createRequest({ invalid: "body" }));
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- app/tests/api/auth/guest-migration-execute.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the route**

Create `app/api/auth/guest-migration/execute/route.ts`:

```typescript
/**
 * Guest Migration Execute API
 *
 * POST /api/auth/guest-migration/execute
 *
 * Executes the migration of guest session data to the authenticated user's account.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import {
  getConvertibleGuestSession,
  clearGuestSessionCookie,
} from "@/lib/conversations/guest/guestSessionService";
import { migrateGuestSession } from "@/lib/auth/server/migrateGuestSession";
import { jsonError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const executeSchema = z.object({
  keepAnonymous: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized", 401);
    }

    // Validate request body
    const rawBody = await request.json().catch(() => null);
    const parsed = executeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    const { keepAnonymous } = parsed.data;
    const adminClient = supabaseAdminClient();

    // Get convertible session
    const guestSession = await getConvertibleGuestSession(adminClient);
    if (!guestSession) {
      return jsonError("No guest session to migrate", 404, "NO_SESSION");
    }

    // Execute migration
    const result = await migrateGuestSession(adminClient, {
      userId: session.user.id,
      guestSessionId: guestSession.guestSessionId,
      keepAnonymous,
    });

    // Clear the guest session cookie
    await clearGuestSessionCookie();

    return NextResponse.json({
      migrated: true,
      responsesCount: result.responsesCount,
      likesCount: result.likesCount,
      feedbackCount: result.feedbackCount,
      joinedHiveIds: result.hiveIds,
      redirectTo: `/hives/${guestSession.hiveKey}`,
    });
  } catch (err) {
    console.error("[POST /api/auth/guest-migration/execute]", err);
    return jsonError("Failed to migrate guest session", 500);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- app/tests/api/auth/guest-migration-execute.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/api/auth/guest-migration/execute/route.ts app/tests/api/auth/guest-migration-execute.test.ts
git commit -m "feat(api): add guest migration execute endpoint"
```

---

## Task 7: Guest Migration Prompt Component

**Files:**

- Create: `app/(auth)/components/GuestMigrationPrompt.tsx`

**Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import Button from "@/app/components/button";

interface GuestMigrationPromptProps {
  guestNumber: number;
  responsesCount: number;
  likesCount: number;
  feedbackCount: number;
  onComplete: (keepAnonymous: boolean) => void;
  loading?: boolean;
}

export default function GuestMigrationPrompt({
  guestNumber,
  responsesCount,
  likesCount,
  feedbackCount,
  onComplete,
  loading = false,
}: GuestMigrationPromptProps) {
  const [keepAnonymous, setKeepAnonymous] = useState(false);

  const totalContributions = responsesCount + likesCount + feedbackCount;
  const contributionText = [
    responsesCount > 0 && `${responsesCount} response${responsesCount !== 1 ? "s" : ""}`,
    likesCount > 0 && `${likesCount} like${likesCount !== 1 ? "s" : ""}`,
    feedbackCount > 0 && `${feedbackCount} vote${feedbackCount !== 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-h3 text-text-primary mb-2">
          Welcome! We found your guest contributions
        </h2>

        <p className="text-body text-text-secondary mb-6">
          You submitted {contributionText} as Guest {guestNumber}. How would you
          like them to appear?
        </p>

        <div className="space-y-3 mb-6">
          <label
            className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
              !keepAnonymous
                ? "border-brand-primary bg-indigo-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="attribution"
              checked={!keepAnonymous}
              onChange={() => setKeepAnonymous(false)}
              className="mt-1"
            />
            <div>
              <span className="text-subtitle text-text-primary">Show my name</span>
              <p className="text-body-sm text-text-secondary">
                Your contributions will display your name
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
              keepAnonymous
                ? "border-brand-primary bg-indigo-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="attribution"
              checked={keepAnonymous}
              onChange={() => setKeepAnonymous(true)}
              className="mt-1"
            />
            <div>
              <span className="text-subtitle text-text-primary">Keep anonymous</span>
              <p className="text-body-sm text-text-secondary">
                Your contributions will show as Anonymous
              </p>
            </div>
          </label>
        </div>

        <Button
          onClick={() => onComplete(keepAnonymous)}
          disabled={loading}
          className="w-full"
        >
          {loading ? "Migrating..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add app/(auth)/components/GuestMigrationPrompt.tsx
git commit -m "feat(ui): add GuestMigrationPrompt component"
```

---

## Task 8: Integrate Migration into Login Flow

**Files:**

- Modify: `app/(auth)/login/LoginPageClient.tsx`

**Step 1: Add migration state and logic**

Add imports at top:

```typescript
import GuestMigrationPrompt from "../components/GuestMigrationPrompt";
```

Add state after existing state declarations:

```typescript
const [migrationData, setMigrationData] = useState<{
  guestNumber: number;
  responsesCount: number;
  likesCount: number;
  feedbackCount: number;
  guestSessionId: string;
  hiveKey: string;
} | null>(null);
const [migrating, setMigrating] = useState(false);
```

Replace the `handleVerifyOtp` function:

```typescript
const handleVerifyOtp = async (code: string) => {
  try {
    setError(null);
    await verifyOtp(submittedEmail, code);

    // Check for guest session to migrate
    try {
      const checkRes = await fetch("/api/auth/guest-migration/check");
      if (checkRes.ok) {
        const data = await checkRes.json();
        if (data.hasGuestSession) {
          setMigrationData({
            guestNumber: data.guestNumber,
            responsesCount: data.responsesCount,
            likesCount: data.likesCount,
            feedbackCount: data.feedbackCount,
            guestSessionId: data.guestSessionId,
            hiveKey: data.hiveKey,
          });
          return; // Don't route yet - show migration prompt
        }
      }
    } catch {
      // Migration check failed - continue with normal flow
    }

    // No migration needed - route normally
    await routeAfterAuth();
  } catch (err) {
    const parsed = getOtpError(err);
    setOtp("");
    setError(parsed.message);
  }
};
```

Add migration handler:

```typescript
const handleMigrationComplete = async (keepAnonymous: boolean) => {
  if (!migrationData) return;

  setMigrating(true);
  try {
    const res = await fetch("/api/auth/guest-migration/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepAnonymous }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(data.redirectTo || "/hives");
    } else {
      // Migration failed - continue anyway
      await routeAfterAuth();
    }
  } catch {
    await routeAfterAuth();
  } finally {
    setMigrating(false);
    setMigrationData(null);
  }
};
```

Add migration prompt render before the return statement, inside the GuestGuard:

```typescript
{migrationData && (
  <GuestMigrationPrompt
    guestNumber={migrationData.guestNumber}
    responsesCount={migrationData.responsesCount}
    likesCount={migrationData.likesCount}
    feedbackCount={migrationData.feedbackCount}
    onComplete={handleMigrationComplete}
    loading={migrating}
  />
)}
```

**Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Verify lint passes**

Run: `npm run lint -- app/(auth)/login/LoginPageClient.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add app/(auth)/login/LoginPageClient.tsx
git commit -m "feat(auth): integrate guest migration into login flow"
```

---

## Task 9: Update Documentation

**Files:**

- Modify: `docs/plans/2026-02-25-guest-to-user-conversion-design.md`
- Modify: `docs/feature-map.md`

**Step 1: Update design doc status**

Change status from "Draft" to "Implemented" in the design doc.

**Step 2: Add feature map entry**

Add to `docs/feature-map.md` under Auth section:

```markdown
| Guest Migration | `app/(auth)/login/LoginPageClient.tsx` | `app/api/auth/guest-migration/*/route.ts` | After OTP, migrates guest contributions to new account | `lib/auth/server/__tests__/migrateGuestSession.test.ts` |
```

**Step 3: Commit**

```bash
git add docs/plans/2026-02-25-guest-to-user-conversion-design.md docs/feature-map.md
git commit -m "docs: mark guest migration as implemented, update feature map"
```

---

## Task 10: Final Verification

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 4: Manual testing checklist**

1. Open a guest share link in incognito
2. Submit a response as guest
3. Click "Sign up" in navbar
4. Complete OTP verification
5. Verify migration prompt appears with correct counts
6. Select "Show my name" and click Continue
7. Verify redirect to the hive
8. Verify response now shows your name (not "Guest N")
9. Repeat test selecting "Keep anonymous"
10. Verify response shows as "Anonymous"

---

## Summary of Files Created/Modified

**New Files:**

- `supabase/migrations/044_guest_session_conversion.sql`
- `lib/auth/server/migrateGuestSession.ts`
- `lib/auth/server/__tests__/migrateGuestSession.test.ts`
- `app/api/auth/guest-migration/check/route.ts`
- `app/api/auth/guest-migration/execute/route.ts`
- `app/tests/api/auth/guest-migration-check.test.ts`
- `app/tests/api/auth/guest-migration-execute.test.ts`
- `app/(auth)/components/GuestMigrationPrompt.tsx`

**Modified Files:**

- `lib/conversations/guest/guestSessionService.ts`
- `lib/conversations/guest/__tests__/guestSessionService.test.ts`
- `app/(auth)/login/LoginPageClient.tsx`
- `docs/plans/2026-02-25-guest-to-user-conversion-design.md`
- `docs/feature-map.md`
