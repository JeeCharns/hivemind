import { cookies } from "next/headers";
import type { Session } from "@supabase/supabase-js";
import { findSupabaseAuthSessionCookie } from "./authCookie";

export async function getSupabaseSessionFromCookies(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const all = cookieStore
      .getAll()
      .map((c) => ({ name: c.name, value: c.value }));
    return findSupabaseAuthSessionCookie(all);
  } catch {
    return null;
  }
}

export async function getSupabaseAccessTokenFromCookies(): Promise<
  string | null
> {
  const session = await getSupabaseSessionFromCookies();
  return session?.access_token ?? null;
}
