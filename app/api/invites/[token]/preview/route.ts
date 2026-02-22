/**
 * GET /api/invites/[token]/preview
 *
 * Public endpoint (no auth required) to fetch hive name for invite preview
 * Used by login page to show "Enter your email address to join {HiveName}"
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { inviteTokenSchema } from "@/lib/hives/schemas";
import { jsonError } from "@/lib/api/errors";

function redactToken(token: string): string {
  if (token.length <= 8) return token;
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function supabaseHostFromEnv(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Validate token format
  const parsed = inviteTokenSchema.safeParse({ token });
  if (!parsed.success) {
    return jsonError("Invalid token format", 400, "VALIDATION_ERROR");
  }

  try {
    // Use service role on the server for this public endpoint so we can safely
    // resolve the hive name without relying on permissive RLS policies.
    const supabase = supabaseAdminClient();

    console.log(
      "[GET /api/invites/[token]/preview] Looking for token:",
      redactToken(token),
      {
        supabaseHost: supabaseHostFromEnv(),
        hasServiceRoleKey: Boolean(
          process.env.SUPABASE_SECRET_KEY ??
          process.env.SUPABASE_SERVICE_ROLE_KEY
        ),
      }
    );

    // Fetch invite link and associated hive
    const { data: inviteLink, error: linkError } = await supabase
      .from("hive_invite_links")
      .select("hive_id, access_mode, hives(name)")
      .eq("token", token)
      .maybeSingle();

    console.log("[GET /api/invites/[token]/preview] Query result:", {
      inviteLink,
      linkError,
    });

    if (linkError) {
      console.error(
        "[GET /api/invites/[token]/preview] Query error:",
        linkError
      );
      return jsonError("Failed to fetch invite", 500);
    }

    if (!inviteLink) {
      console.log(
        "[GET /api/invites/[token]/preview] No invite link found for token:",
        token
      );
      return jsonError("Invite not found", 404, "INVITE_NOT_FOUND");
    }

    // Type assertion for nested hives relation (Supabase returns object or array)
    const hive = inviteLink.hives as unknown as { name?: string } | null;

    return NextResponse.json({
      hiveName: hive?.name || "Unknown Hive",
      accessMode: inviteLink.access_mode,
    });
  } catch (err) {
    console.error("[GET /api/invites/[token]/preview] Unexpected error:", err);
    return jsonError("Internal server error", 500);
  }
}
