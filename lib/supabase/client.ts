import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publicKey) {
  throw new Error("Supabase is not configured – check env vars");
}

export const supabaseBrowserClient = createClient(url, publicKey, {
  auth: { persistSession: true },
});
