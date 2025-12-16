/**
 * POST /api/conversations
 *
 * Create a new conversation
 * Requires authentication and hive membership
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { createConversationSchema } from "@/lib/conversations/schemas";
import { createConversation } from "@/lib/conversations/server/createConversation";

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await requireAuth();
    const userId = session.user.id;

    // Parse and validate request body
    const body = await request.json();
    const parseResult = createConversationSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    const input = parseResult.data;

    // Get Supabase client
    const supabase = await supabaseServerClient();

    // Create conversation
    const result = await createConversation(supabase, userId, input);

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/conversations] Error:", err);

    const message = err instanceof Error ? err.message : "Internal server error";
    const isUnauthorized = message.includes("Unauthorized");

    return NextResponse.json(
      {
        error: isUnauthorized ? "Unauthorized" : "Failed to create conversation",
        code: isUnauthorized ? "UNAUTHORIZED" : "INTERNAL_ERROR",
      },
      { status: isUnauthorized ? 403 : 500 }
    );
  }
}
