"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowserClient;
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    const exchangeCode = async () => {
      const code = searchParams?.get("code");
      const errorDesc = searchParams?.get("error_description");
      if (errorDesc) {
        setError(errorDesc);
        return;
      }
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(
          code
        );
        if (exchangeErr) {
          setError(exchangeErr.message);
          return;
        }
      }
    };

    const loadSession = async () => {
      const { data, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) {
        setError(sessionErr.message);
        return;
      }
      const session = data.session;
      if (!session) {
        setError("No active session found. Try the magic link again.");
        return;
      }
      try {
        const { data: memberships, error: mErr } = await supabase
          .from("hive_members")
          .select("hive_id")
          .eq("user_id", session.user.id);

        if (mErr) throw mErr;

        if (!memberships || memberships.length === 0) {
          router.replace("/welcome");
          return;
        }
        if (memberships.length === 1) {
          router.replace(`/hives/${memberships[0].hive_id}`);
          return;
        }
        router.replace("/hives");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Sign-in failed";
        setError(msg);
      }
    };

    exchangeCode().then(loadSession);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-6 py-8 text-center max-w-md">
        <div className="text-sm text-slate-700">
          {error ? error : "Signing you in..."}
        </div>
      </div>
    </div>
  );
}
