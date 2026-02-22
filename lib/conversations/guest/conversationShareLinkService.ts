/**
 * Conversation Share Link Service
 *
 * Server-side logic for creating, resolving, and revoking
 * temporary anonymous share links for conversations.
 *
 * Follows DIP: accepts SupabaseClient as dependency.
 */

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ShareLinkExpiry,
  ConversationShareLink,
} from "@/types/guest-api";

// ── Helpers ───────────────────────────────────────────────

/**
 * Generate a cryptographically random, URL-safe token.
 * 32 bytes → 256 bits of entropy, base64url encoded.
 */
function generateToken(): string {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Convert a human-readable expiry string to a Date. */
function expiryToDate(expiresIn: ShareLinkExpiry): Date {
  const now = new Date();
  const days: Record<ShareLinkExpiry, number> = {
    "1d": 1,
    "7d": 7,
    "28d": 28,
  };
  now.setDate(now.getDate() + days[expiresIn]);
  return now;
}

/** Build the public guest URL for a share token. */
export function guestUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000";
  const origin = base.startsWith("http") ? base : `https://${base}`;
  return `${origin}/respond/${token}`;
}

// ── Row → domain mapper ──────────────────────────────────

interface ShareLinkRow {
  id: string;
  conversation_id: string;
  token: string;
  expires_at: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

function toShareLink(row: ShareLinkRow): ConversationShareLink {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    token: row.token,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ── Public API ────────────────────────────────────────────

/**
 * Create a new share link for a conversation.
 * If an active, non-expired link already exists it is returned instead.
 */
export async function createShareLink(
  supabase: SupabaseClient,
  conversationId: string,
  createdBy: string,
  expiresIn: ShareLinkExpiry
): Promise<ConversationShareLink> {
  // Check for existing active link
  const { data: existing } = await supabase
    .from("conversation_share_links")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return toShareLink(existing as ShareLinkRow);
  }

  const token = generateToken();
  const expiresAt = expiryToDate(expiresIn);

  const { data, error } = await supabase
    .from("conversation_share_links")
    .insert({
      conversation_id: conversationId,
      token,
      expires_at: expiresAt.toISOString(),
      is_active: true,
      created_by: createdBy,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `[createShareLink] Failed to create share link: ${error?.message ?? "no data"}`
    );
  }

  return toShareLink(data as ShareLinkRow);
}

/**
 * Get the active share link for a conversation (if one exists).
 */
export async function getShareLink(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationShareLink | null> {
  const { data } = await supabase
    .from("conversation_share_links")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data ? toShareLink(data as ShareLinkRow) : null;
}

/**
 * Revoke an active share link, making it permanently inactive.
 */
export async function revokeShareLink(
  supabase: SupabaseClient,
  conversationId: string
): Promise<boolean> {
  const { error, count } = await supabase
    .from("conversation_share_links")
    .update({ is_active: false })
    .eq("conversation_id", conversationId)
    .eq("is_active", true);

  if (error) {
    console.error("[revokeShareLink] Error:", error.message);
    return false;
  }

  return (count ?? 0) > 0 || !error;
}

/**
 * Resolve a share token to its conversation.
 * Uses an admin/service-role client to bypass RLS.
 * Returns null if the token is invalid, expired, or revoked.
 */
export async function resolveShareToken(
  adminClient: SupabaseClient,
  token: string
): Promise<{
  shareLink: ConversationShareLink;
  conversationId: string;
  conversationTitle: string | null;
  conversationDescription: string | null;
  conversationType: string;
} | null> {
  const { data, error } = await adminClient
    .from("conversation_share_links")
    .select(
      `
      *,
      conversations!conversation_share_links_conversation_id_fkey (
        id, title, description, type
      )
    `
    )
    .eq("token", token)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) {
    console.error("[resolveShareToken] Failed to resolve token:", {
      error: error?.message,
      code: error?.code,
      hint: error?.hint,
      details: error?.details,
      hasData: !!data,
      tokenLength: token.length,
    });
    return null;
  }

  const row = data as ShareLinkRow & {
    conversations: {
      id: string;
      title: string | null;
      description: string | null;
      type: string;
    };
  };

  return {
    shareLink: toShareLink(row),
    conversationId: row.conversations.id,
    conversationTitle: row.conversations.title,
    conversationDescription: row.conversations.description,
    conversationType: row.conversations.type,
  };
}
