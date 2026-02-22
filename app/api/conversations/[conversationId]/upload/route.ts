/**
 * POST /api/conversations/[conversationId]/upload
 *
 * Upload a CSV file to import responses
 * Requires authentication and conversation access
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { importResponsesFromCsv } from "@/lib/conversations/server/importResponsesFromCsv";
import { jsonError } from "@/lib/api/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    // Authenticate user
    const session = await requireAuth();
    const userId = session.user.id;

    // Get conversation ID from URL params
    const { conversationId } = await params;

    if (!conversationId) {
      return jsonError("Conversation ID is required", 400, "VALIDATION_ERROR");
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return jsonError("File is required", 400, "VALIDATION_ERROR");
    }

    // Get Supabase client
    const supabase = await supabaseServerClient();

    // Import responses from CSV
    const result = await importResponsesFromCsv(
      supabase,
      conversationId,
      userId,
      file
    );

    return NextResponse.json(
      { importedCount: result.importedCount },
      { status: 200 }
    );
  } catch (err) {
    console.error(
      "[POST /api/conversations/[conversationId]/upload] Error:",
      err
    );

    const message =
      err instanceof Error ? err.message : "Internal server error";

    // Map specific errors to user-friendly messages
    let errorMessage = "Failed to upload CSV";
    let statusCode = 500;

    if (message.includes("not found")) {
      errorMessage = "Conversation not found";
      statusCode = 404;
    } else if (message.includes("CSV")) {
      errorMessage = message; // Use the specific CSV error message
      statusCode = 400;
    } else if (message.includes("Unauthorized")) {
      errorMessage = "Unauthorized";
      statusCode = 403;
    } else if (message.includes("only supported for")) {
      errorMessage = message;
      statusCode = 400;
    }

    return jsonError(
      errorMessage,
      statusCode,
      statusCode === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR"
    );
  }
}
