/**
 * Hive Search API Route
 *
 * GET - Search for hives by name
 * Returns hives with membership status for current user
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { searchJoinableHives } from "@/lib/hives/server/searchJoinableHives";
import { jsonError } from "@/lib/api/errors";

// Validation schema for query params
const searchQuerySchema = z.object({
  term: z
    .string()
    .trim()
    .min(1, "Search term required")
    .max(80, "Search term too long"),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 5))
    .pipe(z.number().int().min(1).max(10)),
});

export async function GET(req: NextRequest) {
  try {
    // 1. Auth required
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    // 2. Validate query params
    const { searchParams } = new URL(req.url);
    const validation = searchQuerySchema.safeParse({
      term: searchParams.get("term") ?? "",
      limit: searchParams.get("limit") || undefined,
    });

    if (!validation.success) {
      const firstError = validation.error.issues?.[0];
      return jsonError(
        firstError?.message ?? "Invalid search parameters",
        400,
        "VALIDATION_ERROR"
      );
    }

    const { term, limit } = validation.data;

    // 3. Call service
    const supabase = await supabaseServerClient();
    const results = await searchJoinableHives(supabase, session.user.id, {
      term,
      limit,
    });

    // 4. Return results
    return NextResponse.json({ results });
  } catch (error) {
    console.error("[GET /api/hives/search] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
