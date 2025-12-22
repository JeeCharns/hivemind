import { createClient } from "@supabase/supabase-js";
import { getSupabaseAccessTokenFromCookies } from "./serverSession";

export async function supabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    console.error("[supabaseServerClient] Missing environment variables:", {
      hasSupabaseUrl: !!supabaseUrl,
      hasPublishableKey: !!supabasePublishableKey,
    });
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing Supabase environment variables: (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL) and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  let accessToken: string | null = null;
  try {
    accessToken = await getSupabaseAccessTokenFromCookies();
  } catch {
    accessToken = null;
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
