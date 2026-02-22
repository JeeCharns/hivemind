/**
 * Guest API Client
 *
 * Client-side data fetcher for guest API endpoints.
 * Mirrors the patterns used by the authenticated responsesClient
 * but hits /api/guest/[token]/* instead.
 */

import type { LiveResponse, ListenTag } from "@/lib/conversations/domain/listen.types";

// ── Responses ─────────────────────────────────────────────

export async function fetchGuestResponses(
  token: string
): Promise<{ responses: LiveResponse[] }> {
  const res = await fetch(`/api/guest/${token}/responses`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to fetch responses");
  }
  return res.json();
}

export async function submitGuestResponse(
  token: string,
  input: { text: string; tag: ListenTag | null }
): Promise<{ response: LiveResponse }> {
  const res = await fetch(`/api/guest/${token}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to submit response");
  }
  return res.json();
}

// ── Likes ─────────────────────────────────────────────────

export async function toggleGuestLike(
  token: string,
  responseId: string,
  liked: boolean
): Promise<{ liked: boolean; like_count: number }> {
  const res = await fetch(
    `/api/guest/${token}/responses/${responseId}/like`,
    {
      method: liked ? "DELETE" : "POST",
      credentials: "include",
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to toggle like");
  }
  return res.json();
}

// ── Feedback ──────────────────────────────────────────────

export async function submitGuestFeedback(
  token: string,
  responseId: string,
  feedback: "agree" | "pass" | "disagree"
): Promise<{ counts: { agree: number; pass: number; disagree: number } }> {
  const res = await fetch(`/api/guest/${token}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ responseId, feedback }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to submit feedback");
  }
  return res.json();
}

// ── Understand ────────────────────────────────────────────

export async function fetchGuestUnderstand(token: string): Promise<unknown> {
  const res = await fetch(`/api/guest/${token}/understand`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to fetch understand data");
  }
  return res.json();
}

// ── Report ────────────────────────────────────────────────

export async function fetchGuestReport(
  token: string
): Promise<{ report: { version: number; html: string; createdAt: string } | null }> {
  const res = await fetch(`/api/guest/${token}/report`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to fetch report");
  }
  return res.json();
}
