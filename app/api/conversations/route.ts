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
import { jsonError } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await requireAuth();
    const userId = session.user.id;

    // Parse and validate request body
    const body = await request.json();
    const parseResult = createConversationSchema.safeParse(body);

    if (!parseResult.success) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
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

    return jsonError(
      isUnauthorized ? "Unauthorized" : "Failed to create conversation",
      isUnauthorized ? 403 : 500,
      isUnauthorized ? "UNAUTHORIZED" : "INTERNAL_ERROR"
    );
  }
}
