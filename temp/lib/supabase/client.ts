import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publicKey) {
  throw new Error("Supabase is not configured – check env vars");
}

// Avoid multiple GoTrueClient instances under HMR by singleton-ing on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalWithSupabase = globalThis as any;
export const supabaseBrowserClient =
  globalWithSupabase.__supabaseBrowserClient ||
  createClient(url, publicKey, {
    auth: { persistSession: true, storageKey: "sb-auth-token-hivemind" },
  });

globalWithSupabase.__supabaseBrowserClient = supabaseBrowserClient;

// Expose for quick debugging in DevTools (non-production use)
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).supabaseBrowserClient = supabaseBrowserClient;
}
