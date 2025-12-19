/**
 * Share Link Service
 *
 * Server service for managing hive invite links.
 * Handles creation, retrieval, and updates of shareable hive join links.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { ensureProfileExists } from "@/lib/profiles/server/ensureProfileExists";

export type AccessMode = "anyone" | "invited_only";

export type ShareLink = {
  id: string;
  hive_id: string;
  token: string;
  access_mode: AccessMode;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Generate a cryptographically strong random token
 */
function generateToken(): string {
  // 32 bytes = 256 bits of entropy, base64url encoded
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Get or create a share link for a hive
 * If no link exists, creates one with default 'anyone' access mode
 */
export async function getOrCreateShareLink(
  supabase: SupabaseClient,
  hiveId: string,
  userId: string
): Promise<ShareLink> {
  // Try to get existing link
  const { data: existing, error: fetchError } = await supabase
    .from("hive_invite_links")
    .select("*")
    .eq("hive_id", hiveId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch share link: ${fetchError.message}`);
  }

  if (existing) {
    return existing as ShareLink;
  }

  // Create new link
  const token = generateToken();

  const { data: newLink, error: insertError } = await supabase
    .from("hive_invite_links")
    .insert({
      hive_id: hiveId,
      token,
      access_mode: "anyone",
      created_by: userId,
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create share link: ${insertError.message}`);
  }

  return newLink as ShareLink;
}

/**
 * Update the access mode of a share link
 */
export async function updateShareLinkAccessMode(
  supabase: SupabaseClient,
  hiveId: string,
  accessMode: AccessMode
): Promise<ShareLink> {
  const { data: updated, error } = await supabase
    .from("hive_invite_links")
    .update({ access_mode: accessMode })
    .eq("hive_id", hiveId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update share link: ${error.message}`);
  }

  return updated as ShareLink;
}

/**
 * Get a share link by token
 */
export async function getShareLinkByToken(
  supabase: SupabaseClient,
  token: string
): Promise<ShareLink | null> {
  const { data, error } = await supabase
    .from("hive_invite_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch share link: ${error.message}`);
  }

  return data as ShareLink | null;
}

/**
 * Check if a user can join a hive via invite link
 * Returns true if:
 * - access_mode is 'anyone', OR
 * - access_mode is 'invited_only' AND user's email has a pending invite
 */
export async function canAcceptInvite(
  supabase: SupabaseClient,
  hiveId: string,
  userEmail: string,
  accessMode: AccessMode
): Promise<boolean> {
  if (accessMode === "anyone") {
    return true;
  }

  // Check for pending invite with matching email (case-insensitive)
  const { data: invite, error } = await supabase
    .from("hive_invites")
    .select("*")
    .eq("hive_id", hiveId)
    .ilike("email", userEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check invite: ${error.message}`);
  }

  return !!invite;
}

/**
 * Add a user to a hive (idempotent)
 * If already a member, returns success
 */
export async function addUserToHive(
  supabase: SupabaseClient,
  hiveId: string,
  userId: string,
  userEmail?: string
): Promise<void> {
  // Ensure the user has a profile row (hive_members.user_id has an FK to profiles)
  await ensureProfileExists(supabase, { id: userId, email: userEmail });

  // Upsert membership (idempotent)
  const { error } = await supabase.from("hive_members").upsert(
    {
      hive_id: hiveId,
      user_id: userId,
      role: "member",
    },
    { onConflict: "hive_id,user_id" }
  );

  if (error) {
    throw new Error(`Failed to add user to hive: ${error.message}`);
  }
}

/**
 * Mark an invite as accepted
 */
export async function markInviteAccepted(
  supabase: SupabaseClient,
  hiveId: string,
  userEmail: string
): Promise<void> {
  const { error } = await supabase
    .from("hive_invites")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("hive_id", hiveId)
    .ilike("email", userEmail)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to mark invite as accepted: ${error.message}`);
  }
}
