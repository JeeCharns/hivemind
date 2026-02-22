/**
 * Guest Session Service
 *
 * Manages ephemeral guest sessions for anonymous share link visitors.
 * Each guest gets a "Guest N" number scoped to the share link.
 *
 * Session tokens are stored as SHA-256 hashes; the raw token
 * only lives in the httpOnly cookie on the visitor's browser.
 */

import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Constants ─────────────────────────────────────────────

export const GUEST_SESSION_COOKIE = "hivemind_guest_session";
const SESSION_TOKEN_BYTES = 32;

// ── Helpers ───────────────────────────────────────────────

function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── Types ─────────────────────────────────────────────────

export interface GuestSessionRecord {
  id: string;
  shareLinkId: string;
  guestNumber: number;
  expiresAt: string;
}

export interface ValidatedGuestSession {
  guestSessionId: string;
  guestNumber: number;
  shareLinkId: string;
  conversationId: string;
  conversationTitle: string | null;
  conversationDescription: string | null;
  conversationType: string;
}

// ── Public API ────────────────────────────────────────────

/**
 * Create a new guest session for a share link.
 * Assigns the next sequential guest number.
 * Sets an httpOnly cookie with the session token.
 */
export async function createGuestSession(
  adminClient: SupabaseClient,
  shareLinkId: string,
  expiresAt: string
): Promise<GuestSessionRecord> {
  // Get next guest number for this share link
  const { data: maxRow } = await adminClient
    .from("guest_sessions")
    .select("guest_number")
    .eq("share_link_id", shareLinkId)
    .order("guest_number", { ascending: false })
    .limit(1)
    .single();

  const nextNumber = (maxRow?.guest_number ?? 0) + 1;

  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);

  const { data, error } = await adminClient
    .from("guest_sessions")
    .insert({
      share_link_id: shareLinkId,
      guest_number: nextNumber,
      session_token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id, share_link_id, guest_number, expires_at")
    .single();

  if (error || !data) {
    throw new Error(
      `[createGuestSession] Failed: ${error?.message ?? "no data"}`
    );
  }

  // Set the session cookie
  const cookieStore = await cookies();
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  );

  cookieStore.set(GUEST_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: maxAgeSeconds,
    path: "/",
  });

  return {
    id: data.id,
    shareLinkId: data.share_link_id,
    guestNumber: data.guest_number,
    expiresAt: data.expires_at,
  };
}

/**
 * Validate an existing guest session from the cookie.
 * Returns the session plus resolved conversation metadata, or null.
 */
export async function validateGuestSession(
  adminClient: SupabaseClient
): Promise<ValidatedGuestSession | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(GUEST_SESSION_COOKIE)?.value;

  if (!rawToken) {
    return null;
  }

  const tokenHash = hashToken(rawToken);

  const { data, error } = await adminClient
    .from("guest_sessions")
    .select(
      `
      id,
      share_link_id,
      guest_number,
      expires_at,
      conversation_share_links!guest_sessions_share_link_id_fkey (
        id,
        conversation_id,
        is_active,
        expires_at,
        conversations!conversation_share_links_conversation_id_fkey (
          id, title, description, type
        )
      )
    `
    )
    .eq("session_token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkData = data.conversation_share_links as any;
  if (!linkData || !linkData.is_active) {
    return null;
  }

  // Check share link hasn't expired
  if (new Date(linkData.expires_at) <= new Date()) {
    return null;
  }

  const conversation = linkData.conversations;
  if (!conversation) {
    return null;
  }

  return {
    guestSessionId: data.id,
    guestNumber: data.guest_number,
    shareLinkId: data.share_link_id,
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    conversationDescription: conversation.description,
    conversationType: conversation.type,
  };
}

/**
 * Read the guest session cookie value (raw token) if present.
 */
export async function getGuestSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(GUEST_SESSION_COOKIE)?.value ?? null;
}

/**
 * Clear the guest session cookie.
 */
export async function clearGuestSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_SESSION_COOKIE);
}
