import { cookies } from "next/headers";

const COOKIE_NAME = "hivemind_invite_token";
const MAX_AGE_SECONDS = 3600; // 1 hour

/**
 * Sets the invite token cookie (server-side only).
 * Used when an unauthenticated user visits an invite link.
 */
export async function setInviteCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

/**
 * Gets the invite token from the cookie (server-side only).
 * Returns null if the cookie doesn't exist.
 */
export async function getInviteCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  return cookie?.value ?? null;
}

/**
 * Clears the invite token cookie (server-side only).
 * Called after the invite has been processed.
 */
export async function clearInviteCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
