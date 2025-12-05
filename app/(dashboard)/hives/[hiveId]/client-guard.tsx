"use client";

import { useCurrentUser } from "@/lib/utils/use-current-user";
import { useEffect, useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function HiveClientGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowserClient;
    if (!supabase) {
      setHasSession(false);
      setSessionChecked(true);
      return;
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("[hive-client-guard] getSession error", error);
      }
      setHasSession(!!data.session);
      setSessionChecked(true);
      if (!data.session) {
        console.warn("[hive-client-guard] no session found, redirecting to /");
        router.push("/");
      }
    });
  }, [router]);

  if (loading || !sessionChecked) {
    return (
      <div className="min-h-[200px] flex items-center justify-center text-sm text-slate-600">
        Loading your session…
      </div>
    );
  }

  if (!user || !hasSession) {
    return (
      <div className="min-h-[200px] flex items-center justify-center text-sm text-red-600">
        Session missing. Please sign in again.
      </div>
    );
  }

  return <>{children}</>;
}
