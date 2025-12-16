import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getValidatedAuthState } from "./sessionValidation";
import type { Session } from "../domain/session.types";

/**
 * Server-side auth guard for server components and route handlers
 * Throws redirect if user is not authenticated
 */
export async function requireAuth(): Promise<Session> {
  // Fast path: validate token locally first (no network call)
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
  const authState = getValidatedAuthState(allCookies);

  if (!authState.isAuthenticated) {
    redirect("/login");
  }

  const session = authState.session!; // Safe because isAuthenticated === true

  const supabase = await supabaseServerClient();
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null =
    null;
  let error: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"] | null =
    null;
  try {
    const result = await supabase.auth.getUser(session.access_token);
    user = result.data.user;
    error = result.error;
  } catch (err) {
    console.error("[requireAuth] supabase.auth.getUser failed", err);
    redirect("/login");
  }

  if (error || !user) {
    redirect("/login");
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      name: user.user_metadata?.name,
    },
    activeHiveId: undefined, // Can be extended to fetch from DB
    roles: user.user_metadata?.roles || [],
  };
}

/**
 * Get current session without redirecting
 * Returns null if not authenticated
 */
export async function getServerSession(): Promise<Session | null> {
  // Fast path: validate token locally first (no network call)
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
  const authState = getValidatedAuthState(allCookies);

  if (!authState.isAuthenticated) {
    return null;
  }

  const session = authState.session!; // Safe because isAuthenticated === true

  const supabase = await supabaseServerClient();
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null =
    null;
  let error: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"] | null =
    null;
  try {
    const result = await supabase.auth.getUser(session.access_token);
    user = result.data.user;
    error = result.error;
  } catch (err) {
    console.error("[getServerSession] supabase.auth.getUser failed", err);
    return null;
  }

  if (error || !user) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      name: user.user_metadata?.name,
    },
    activeHiveId: undefined,
    roles: user.user_metadata?.roles || [],
  };
}
