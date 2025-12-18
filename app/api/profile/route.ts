/**
 * Profile API Route
 *
 * POST - Create/update user profile with display name and optional avatar
 * Accepts multipart/form-data with displayName and optional avatar file
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { upsertProfile } from "@/lib/profile/server/upsertProfile";
import { upsertProfileFormSchema, avatarFileSchema } from "@/lib/profile/schemas";
import { jsonError } from "@/lib/api/errors";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: NextRequest) {
  try {
    // 1. Auth required
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    // 2. Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonError("Invalid form data", 400, "VALIDATION_ERROR");
    }

    const displayName = formData.get("displayName");
    const avatarFile = formData.get("avatar");

    // 3. Validate displayName
    const nameValidation = upsertProfileFormSchema.safeParse({ displayName });
    if (!nameValidation.success) {
      const firstError = nameValidation.error.issues?.[0];
      return jsonError(
        firstError?.message ?? "Invalid display name",
        400,
        "VALIDATION_ERROR"
      );
    }

    // 4. Validate avatar file if provided
    let avatarData: {
      buffer: Buffer;
      fileName: string;
      contentType: string;
    } | null = null;

    if (avatarFile && avatarFile instanceof File) {
      // Check file size
      if (avatarFile.size > MAX_FILE_SIZE) {
        return jsonError(
          "File size must be less than 2MB",
          400,
          "UPLOAD_FAILED"
        );
      }

      // Check file type
      if (!ALLOWED_TYPES.includes(avatarFile.type)) {
        return jsonError(
          "File must be a JPEG, PNG, WebP, or GIF image",
          400,
          "UPLOAD_FAILED"
        );
      }

      // Validate with Zod schema
      const fileValidation = avatarFileSchema.safeParse({
        size: avatarFile.size,
        type: avatarFile.type,
      });

      if (!fileValidation.success) {
        const firstError = fileValidation.error.issues?.[0];
        return jsonError(
          firstError?.message ?? "Invalid file",
          400,
          "UPLOAD_FAILED"
        );
      }

      // Convert file to buffer
      const arrayBuffer = await avatarFile.arrayBuffer();
      avatarData = {
        buffer: Buffer.from(arrayBuffer),
        fileName: avatarFile.name,
        contentType: avatarFile.type,
      };
    }

    // 5. Call service
    const supabase = await supabaseServerClient();
    const result = await upsertProfile(supabase, session.user.id, {
      displayName: nameValidation.data.displayName,
      avatarFile: avatarData,
    });

    // 6. Return success
    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/profile] Error:", error);

    const message =
      error instanceof Error ? error.message : "Internal server error";

    // Handle specific error types
    if (message.includes("Avatar upload failed")) {
      return jsonError(message, 500, "UPLOAD_FAILED");
    }

    if (message.includes("Failed to update profile")) {
      return jsonError("Failed to update profile", 500, "DB_ERROR");
    }

    return jsonError("Internal server error", 500, "INTERNAL_ERROR");
  }
}
