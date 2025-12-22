import { createClient } from "@supabase/supabase-js";

export function supabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error("[supabaseAdminClient] Missing environment variables:", {
      hasSupabaseUrl: !!supabaseUrl,
      hasSecretKey: !!supabaseSecretKey,
    });
  }

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Missing Supabase environment variables: (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL) and SUPABASE_SECRET_KEY"
    );
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

