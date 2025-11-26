import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY || process.env.SUPABASE_PUBLIC_KEY;

export const supabaseBrowserClient =
  url && publicKey ? createClient(url, publicKey) : null;
