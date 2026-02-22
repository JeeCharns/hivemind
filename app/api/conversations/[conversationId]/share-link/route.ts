/**
 * Conversation Share Link API
 *
 * POST: Create (or return existing) anonymous share link for a conversation.
 * GET:  Get the active share link for a conversation.
 * DELETE: Revoke the active share link.
 *
 * Auth: session required + hive membership.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import { jsonError } from "@/lib/api/errors";
import { createShareLinkSchema } from "@/lib/conversations/guest/schemas";
import {
  createShareLink,
  getShareLink,
  revokeShareLink,
  guestUrl,
} from "@/lib/conversations/guest/conversationShareLinkService";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────

async function resolveConversationHive(
  supabase: Awaited<ReturnType<typeof supabaseServerClient>>,
  conversationId: string
) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, hive_id")
    .eq("id", conversationId)
    .single();

  if (error || !data) return null;
  return data as { id: string; hive_id: string };
}

// ── POST — create share link ──────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return jsonError("Unauthorised", 401);

    const { conversationId } = await params;
    const supabase = await supabaseServerClient();

    const conversation = await resolveConversationHive(supabase, conversationId);
    if (!conversation) return jsonError("Conversation not found", 404);

    await requireHiveMember(supabase, session.user.id, conversation.hive_id);

    const body = await request.json();
    const parsed = createShareLinkSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    const link = await createShareLink(
      supabase,
      conversationId,
      session.user.id,
      parsed.data.expiresIn
    );

    return NextResponse.json({
      url: guestUrl(link.token),
      token: link.token,
      expiresAt: link.expiresAt,
    });
  } catch (err) {
    console.error("[POST /api/conversations/[id]/share-link]", err);
    return jsonError("Internal server error", 500);
  }
}

// ── GET — fetch active share link ─────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return jsonError("Unauthorised", 401);

    const { conversationId } = await params;
    const supabase = await supabaseServerClient();

    const conversation = await resolveConversationHive(supabase, conversationId);
    if (!conversation) return jsonError("Conversation not found", 404);

    await requireHiveMember(supabase, session.user.id, conversation.hive_id);

    const link = await getShareLink(supabase, conversationId);
    if (!link) {
      return NextResponse.json({ link: null });
    }

    return NextResponse.json({
      url: guestUrl(link.token),
      token: link.token,
      expiresAt: link.expiresAt,
      isActive: link.isActive,
    });
  } catch (err) {
    console.error("[GET /api/conversations/[id]/share-link]", err);
    return jsonError("Internal server error", 500);
  }
}

// ── DELETE — revoke share link ────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return jsonError("Unauthorised", 401);

    const { conversationId } = await params;
    const supabase = await supabaseServerClient();

    const conversation = await resolveConversationHive(supabase, conversationId);
    if (!conversation) return jsonError("Conversation not found", 404);

    await requireHiveMember(supabase, session.user.id, conversation.hive_id);

    const revoked = await revokeShareLink(supabase, conversationId);
    return NextResponse.json({ revoked });
  } catch (err) {
    console.error("[DELETE /api/conversations/[id]/share-link]", err);
    return jsonError("Internal server error", 500);
  }
}
