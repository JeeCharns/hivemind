import type { Session } from "@supabase/supabase-js";

type NamedCookie = { name: string; value: string };

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function looksLikeBase64(value: string): boolean {
  // Avoid false positives on JSON or empty strings.
  if (!value || value.startsWith("{") || value.startsWith("[")) return false;
  return /^[A-Za-z0-9+/=_-]+$/.test(value);
}

function normalizeBase64(input: string): string {
  // Supabase uses "base64-" prefix and may use base64url encoding.
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  return `${base64}${padding}`;
}

function decodeBase64ToString(value: string): string | null {
  const normalized = normalizeBase64(value);
  try {
    if (typeof globalThis.atob === "function") {
      return globalThis.atob(normalized);
    }
  } catch {}

  try {
    if (typeof Buffer === "undefined") return null;
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export function parseSupabaseAuthCookieValue(value: string): Session | null {
  const decoded = safeDecodeURIComponent(value);

  try {
    const parsed = JSON.parse(decoded) as Partial<Session>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.access_token !== "string") return null;
    return parsed as Session;
  } catch {
    // Supabase SSR cookies are often stored as "base64-<json>".
    const base64Prefixed = decoded.startsWith("base64-")
      ? decoded.slice("base64-".length)
      : null;
    const base64Candidate =
      base64Prefixed ?? (looksLikeBase64(decoded) ? decoded : null);
    if (!base64Candidate) return null;

    const json = decodeBase64ToString(base64Candidate);
    if (!json) return null;

    try {
      const parsed = JSON.parse(json) as Partial<Session>;
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.access_token !== "string") return null;
      return parsed as Session;
    } catch {
      return null;
    }
  }
}

export function findSupabaseAuthSessionCookie(
  cookies: NamedCookie[]
): Session | null {
  const cookieGroups = new Map<
    string,
    { baseValue: string | null; chunks: Map<number, string> }
  >();

  for (const cookie of cookies) {
    const match = cookie.name.match(/^(.*-auth-token)(?:\.(\d+))?$/);
    if (!match) continue;

    const baseName = match[1];
    const chunkIndex = match[2] ? Number(match[2]) : null;

    const group = cookieGroups.get(baseName) ?? {
      baseValue: null,
      chunks: new Map<number, string>(),
    };

    if (chunkIndex === null) {
      group.baseValue = cookie.value;
    } else if (!Number.isNaN(chunkIndex)) {
      group.chunks.set(chunkIndex, cookie.value);
    }

    cookieGroups.set(baseName, group);
  }

  for (const group of cookieGroups.values()) {
    const hasChunks = group.chunks.size > 0;
    const value = hasChunks
      ? [...group.chunks.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, v]) => v)
          .join("")
      : (group.baseValue ?? "");

    const session = value ? parseSupabaseAuthCookieValue(value) : null;
    if (session?.access_token) return session;
  }

  return null;
}
