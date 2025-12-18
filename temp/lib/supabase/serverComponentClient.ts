import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Create a Supabase client that reads the user's auth token from the Supabase cookie
 * and forwards it via Authorization so auth.getUser() and RLS work on the server.
 */
export async function createSupabaseServerComponentClient(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRole = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase server client is not configured (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing)"
    );
  }

  // Look for the supabase auth token cookie (sb-<project>-auth-token)
  const cookieStore = await cookies();
  const authCookie = cookieStore
    .getAll()
    .find((c) => c.name.endsWith("-auth-token") || c.name.includes("auth-token"));

  let accessToken: string | null = null;
  if (authCookie) {
    try {
      const parsed = JSON.parse(authCookie.value);
      accessToken = parsed?.access_token ?? null;
    } catch {
      accessToken = null;
    }
  }

  // If we have an access token, use anon + Authorization so RLS applies correctly.
  if (accessToken) {
    return createClient(url, publishableKey, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  // Fallback: no auth token cookie found. Use service role to avoid breaking SSR,
  // but note this bypasses RLS. Suitable only for server-only reads like resolving
  // last_hive_id. For stricter security, add middleware to sync auth cookies.
  if (!serviceRole) {
    return createClient(url, publishableKey);
  }
  return createClient(url, serviceRole);
}
