import type { Session } from "@supabase/supabase-js";
import { findSupabaseAuthSessionCookie } from "@/lib/supabase/authCookie";

/**
 * Clock skew buffer in seconds to handle minor time differences
 * between server and token issuer
 */
const CLOCK_SKEW_BUFFER_SECONDS = 30;

/**
 * Validation failure reasons
 */
export type ValidationReason =
  | "missing"
  | "invalid"
  | "expired"
  | "no-exp"
  | "no-sub"
  | "valid";

/**
 * Result of auth state validation
 */
export interface ValidatedAuthState {
  isAuthenticated: boolean;
  reason: ValidationReason;
  userId?: string;
  session?: Session;
}

/**
 * JWT payload structure
 */
interface JwtPayload {
  exp?: number;
  sub?: string;
  [key: string]: unknown;
}

/**
 * Decode a JWT payload without verification
 * This is safe for reading claims but NOT for security decisions
 * The actual signature verification is done by Supabase
 */
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    // Convert base64url to base64
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
    const normalizedBase64 = `${base64}${padding}`;

    // Decode base64
    let decoded: string;
    if (typeof globalThis.atob === "function") {
      decoded = globalThis.atob(normalizedBase64);
    } else if (typeof Buffer !== "undefined") {
      decoded = Buffer.from(normalizedBase64, "base64").toString("utf8");
    } else {
      return null;
    }

    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Validate JWT token locally without network call
 * Checks for:
 * - Valid JWT structure
 * - Expiration time (exp)
 * - Subject (sub) presence
 */
function validateToken(accessToken: string): {
  isValid: boolean;
  reason: ValidationReason;
  userId?: string;
} {
  // Check if token looks like a JWT
  if (!accessToken || typeof accessToken !== "string") {
    return { isValid: false, reason: "invalid" };
  }

  const parts = accessToken.split(".");
  if (parts.length !== 3) {
    return { isValid: false, reason: "invalid" };
  }

  // Decode payload
  const payload = decodeJwtPayload(accessToken);
  if (!payload) {
    return { isValid: false, reason: "invalid" };
  }

  // Extract userId (sub)
  const userId = typeof payload.sub === "string" ? payload.sub : undefined;
  if (!userId) {
    return { isValid: false, reason: "no-sub", userId };
  }

  // Check expiration
  if (typeof payload.exp !== "number") {
    // Conservative: treat missing exp as unauthenticated to prevent loops
    return { isValid: false, reason: "no-exp", userId };
  }

  // Calculate current time with clock skew buffer
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expWithBuffer = payload.exp - CLOCK_SKEW_BUFFER_SECONDS;

  if (nowSeconds >= expWithBuffer) {
    return { isValid: false, reason: "expired", userId };
  }

  return { isValid: true, reason: "valid", userId };
}

/**
 * Get validated auth state from request cookies
 * This is the single source of truth for middleware auth decisions
 *
 * @param cookies - Array of cookies from NextRequest
 * @returns Validated auth state with reason
 */
export function getValidatedAuthState(
  cookies: Array<{ name: string; value: string }>
): ValidatedAuthState {
  // Try to find and parse Supabase auth cookie
  const session = findSupabaseAuthSessionCookie(cookies);

  if (!session) {
    return {
      isAuthenticated: false,
      reason: "missing",
    };
  }

  if (!session.access_token) {
    return {
      isAuthenticated: false,
      reason: "invalid",
    };
  }

  // Validate token locally
  const validation = validateToken(session.access_token);

  return {
    isAuthenticated: validation.isValid,
    reason: validation.reason,
    userId: validation.userId,
    session: validation.isValid ? session : undefined,
  };
}

/**
 * Environment flag to enable debug logging
 */
const DEBUG_AUTH = process.env.DEBUG_AUTH_MW === "true" || process.env.NODE_ENV === "development";

/**
 * Log auth validation for debugging
 * Only logs in development or when DEBUG_AUTH_MW is enabled
 * Never logs sensitive tokens
 */
export function logAuthValidation(
  pathname: string,
  state: ValidatedAuthState,
  action?: string
): void {
  if (!DEBUG_AUTH) return;

  const logData = {
    pathname,
    isAuthenticated: state.isAuthenticated,
    reason: state.reason,
    userId: state.userId ? `${state.userId.substring(0, 8)}...` : undefined,
    action,
  };

  console.log("[Auth Middleware]", JSON.stringify(logData, null, 2));
}
