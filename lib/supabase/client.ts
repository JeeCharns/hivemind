import { createClient } from "@supabase/supabase-js";
import { cookieStorage } from "./cookieStorage";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

/**
 * Browser Supabase client for client-side operations
 * Uses cookie storage instead of localStorage to persist PKCE code verifiers
 * This prevents issues where logging out clears the code verifier before the magic link is clicked
 *
 * PKCE flow enabled for secure authentication
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
