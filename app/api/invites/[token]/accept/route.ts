/**
 * POST /api/invites/[token]/accept
 *
 * Accepts an invite link and adds the authenticated user to the hive
 * Validates access mode and email whitelist for invited_only mode
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { inviteTokenSchema } from "@/lib/hives/schemas";
import { jsonError } from "@/lib/api/errors";
import {
  type AccessMode,
  getShareLinkByToken,
  canAcceptInvite,
  addUserToHive,
  markInviteAccepted,
} from "@/lib/hives/server/shareLinkService";

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // 1. Require authentication
  const session = await getServerSession();
  if (!session) {
    return jsonError("Unauthorized", 401, "UNAUTHORIZED");
  }

  // 2. Validate token format
  const parsed = inviteTokenSchema.safeParse({ token });
  if (!parsed.success) {
    return jsonError("Invalid token format", 400, "VALIDATION_ERROR");
  }

  try {
    const supabase = await supabaseServerClient();
    const admin = supabaseAdminClient();

    console.log("[POST /api/invites/[token]/accept] Accepting token:", redactToken(token), {
      supabaseHost: supabaseHostFromEnv(),
      hasServiceRoleKey: Boolean(
        process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
    });

    // 3. Fetch invite link
    // Important: a user who is not yet a hive member cannot pass RLS on
    // `hive_invite_links`, so we must resolve the token server-side.
    const inviteLink = await getShareLinkByToken(admin, token);
    if (!inviteLink) {
      console.log("[POST /api/invites/[token]/accept] Invite not found for token:", redactToken(token));
      return jsonError("Invite not found", 404, "INVITE_NOT_FOUND");
    }

    console.log("[POST /api/invites/[token]/accept] Invite resolved:", {
      hiveId: inviteLink.hive_id,
      accessMode: inviteLink.access_mode,
    });

    // 4. Validate access based on mode
    const userEmail = session.user.email;
    if (!userEmail) {
      return jsonError("User email not found", 400, "VALIDATION_ERROR");
    }

    const accessMode = inviteLink.access_mode as AccessMode;
    const canAccept = await canAcceptInvite(admin, inviteLink.hive_id, userEmail, accessMode);

    if (!canAccept) {
      return jsonError(
        "This invite is restricted to invited emails only. Your email is not on the list.",
        403,
        "INVITE_FORBIDDEN"
      );
    }

    // 5. Add user to hive (idempotent)
    await addUserToHive(supabase, inviteLink.hive_id, session.user.id, userEmail);

    // 6. Mark invite as accepted if invited_only mode
    if (inviteLink.access_mode === "invited_only") {
      await markInviteAccepted(admin, inviteLink.hive_id, userEmail);
    }

    // 7. Fetch hive key for redirect
    const { data: hive, error: hiveError } = await admin
      .from("hives")
      .select("id, slug")
      .eq("id", inviteLink.hive_id)
      .maybeSingle();

    if (hiveError) {
      console.error("[POST /api/invites/[token]/accept] Failed to fetch hive:", hiveError);
    }

    return NextResponse.json({
      hiveKey: hive?.slug || hive?.id || inviteLink.hive_id,
      message: "Successfully joined hive",
    });
  } catch (err) {
    console.error("[POST /api/invites/[token]/accept] Error:", err);
    return jsonError(
      err instanceof Error ? err.message : "Failed to accept invite",
      500
    );
  }
}
