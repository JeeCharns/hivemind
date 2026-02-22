/**
 * Guest Access API Types
 *
 * Shared request/response types for conversation share links
 * and guest session endpoints.
 */

import type { ApiErrorShape } from "./api";

// ── Share Link Types ──────────────────────────────────────

export type ShareLinkExpiry = "1d" | "7d" | "28d";

export interface ConversationShareLink {
  id: string;
  conversationId: string;
  token: string;
  expiresAt: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface CreateShareLinkRequest {
  expiresIn: ShareLinkExpiry;
}

export interface CreateShareLinkResponse {
  url: string;
  token: string;
  expiresAt: string;
}

export interface GetShareLinkResponse {
  url: string;
  token: string;
  expiresAt: string;
  isActive: boolean;
}

export interface RevokeShareLinkResponse {
  revoked: boolean;
}

// ── Guest Session Types ───────────────────────────────────

export interface GuestSessionInfo {
  guestSessionId: string;
  guestNumber: number;
  conversationId: string;
  conversationTitle: string | null;
  conversationDescription: string | null;
  conversationType: "understand" | "decide";
  expiresAt: string;
  tabs: ("listen" | "understand" | "result")[];
}

export interface GuestSessionResponse {
  session: GuestSessionInfo;
}

// ── Guest API Error ───────────────────────────────────────

export type GuestApiError = ApiErrorShape;
