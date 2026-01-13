import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { jsonError } from "@/lib/api/errors";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { createHive } from "@/lib/hives/server/createHive";
import {
  createHiveJsonBodySchema,
  createHiveNameSchema,
  hiveLogoFileSchema,
  hiveVisibilitySchema,
} from "@/lib/hives/schemas";

/**
 * GET /api/hives
 * List all hives where the user is a member
 */
export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const supabase = await supabaseServerClient();

  // Get hives where user is a member
  const { data: memberships, error: memberError } = await supabase
    .from("hive_members")
    .select("hive_id")
    .eq("user_id", session.user.id);

  if (memberError) {
    return jsonError(memberError.message, 500);
  }

  const hiveIds = memberships.map((m) => m.hive_id);

  if (hiveIds.length === 0) {
    return NextResponse.json([]);
  }

  const { data: hives, error: hiveError } = await supabase
    .from("hives")
    .select("*")
    .in("id", hiveIds)
    .order("created_at", { ascending: false });

  if (hiveError) {
    return jsonError(hiveError.message, 500);
  }

  return NextResponse.json(hives);
}

/**
 * POST /api/hives
 * Create a new hive and add the user as admin
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    const contentType = req.headers.get("content-type") ?? "";

    let name: string | null = null;
    let logoUrl: string | null = null;
    let logoFile: { buffer: Buffer; fileName: string; contentType: string } | null =
      null;
    let visibility: "public" | "private" = "public";

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      const parsed = createHiveJsonBodySchema.safeParse(body);
      if (!parsed.success) {
        const firstError = parsed.error.issues?.[0];
        return jsonError(
          firstError?.message ?? "Invalid input",
          400,
          "VALIDATION_ERROR"
        );
      }
      name = parsed.data.name;
      logoUrl = parsed.data.logo_url ?? null;
      visibility = parsed.data.visibility ?? "public";
    } else {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return jsonError("Invalid form data", 400, "VALIDATION_ERROR");
      }

      const parsed = createHiveNameSchema.safeParse({
        name: formData.get("name"),
      });
      if (!parsed.success) {
        const firstError = parsed.error.issues?.[0];
        return jsonError(
          firstError?.message ?? "Invalid hive name",
          400,
          "VALIDATION_ERROR"
        );
      }

      name = parsed.data.name;

      // Parse visibility from form data
      const visibilityRaw = formData.get("visibility");
      const visibilityParsed = hiveVisibilitySchema.safeParse(visibilityRaw);
      if (visibilityParsed.success) {
        visibility = visibilityParsed.data;
      }

      const file = formData.get("logo");
      if (file && file instanceof File) {
        const fileValidation = hiveLogoFileSchema.safeParse({
          size: file.size,
          type: file.type,
        });
        if (!fileValidation.success) {
          const firstError = fileValidation.error.issues?.[0];
          return jsonError(
            firstError?.message ?? "Invalid logo file",
            400,
            "UPLOAD_FAILED"
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        logoFile = {
          buffer: Buffer.from(arrayBuffer),
          fileName: file.name,
          contentType: file.type,
        };
      }
    }

    if (!name) {
      return jsonError("Invalid input", 400, "VALIDATION_ERROR");
    }

    const supabase = await supabaseServerClient();
    const hive = await createHive(supabase, session.user.id, {
      name,
      logoUrl,
      logoFile,
      visibility,
    });

    return NextResponse.json(hive);
  } catch (error) {
    console.error("[POST /api/hives] Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    if (message.toLowerCase().includes("upload")) {
      return jsonError("Failed to upload logo", 500, "UPLOAD_FAILED");
    }

    return jsonError("Internal server error", 500, "INTERNAL_ERROR");
  }
}
