import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

export const supabaseServerClient = () => {
  if (!url || !secretKey) {
    throw new Error("Supabase server client is not configured (URL/secret key)");
  }
  return createClient(url, secretKey);
};
