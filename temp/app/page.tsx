"use client";

import AuthGate from "@/components/auth-gate";
import type { Session, AuthError } from "@supabase/supabase-js";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { useEffect } from "react";

export default function Home() {
  // No auto-redirect; always show AuthGate. Emit a simple session log once for debugging.
  useEffect(() => {
    const supabase = supabaseBrowserClient;
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(
        ({
          data,
          error,
        }: {
          data: { session: Session | null };
          error: AuthError | null;
        }) => {
          console.log("[home] render pathname", window.location.pathname, {
            hasSession: !!data.session,
            sessionUser: data.session?.user?.id,
            sessionErr: error,
          });
        }
      );
  }, []);

  return <AuthGate />;
}
