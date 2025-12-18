import { createClient } from "@supabase/supabase-js";
import { cookieStorage } from "./cookieStorage";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  );
}

/**
 * Browser Supabase client for client-side operations
 * Uses cookie storage instead of localStorage to persist PKCE code verifiers
 * This prevents issues where logging out clears the code verifier before the magic link is clicked
 *
 * PKCE flow enabled for secure authentication
 */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    flowType: "pkce",
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
