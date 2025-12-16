"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/lib/utils/use-current-user";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import type { Session, AuthError } from "@supabase/supabase-js";

export default function ClientDebugBanner() {
  const { user, loading } = useCurrentUser();
  const [sessionInfo, setSessionInfo] = useState("pending");

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
          setSessionInfo(
            `hasSession=${!!data.session} user=${data.session?.user?.id ?? "none"} err=${
              error?.message ?? "none"
            }`
          );
        }
      );
  }, []);

  if (typeof window === "undefined") return null;

  return (
    <div className="absolute top-3 left-3 z-50 bg-white/90 border border-amber-300 text-amber-800 text-xs rounded-md px-3 py-2 shadow-sm">
      <div>Path: {window.location.pathname}</div>
      <div>useCurrentUser loading: {String(loading)}</div>
      <div>useCurrentUser user: {user?.id ?? "null"}</div>
      <div>auth.getSession: {sessionInfo}</div>
    </div>
  );
}
