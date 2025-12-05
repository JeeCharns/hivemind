"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("[auth-callback] mounted");
    const supabase = supabaseBrowserClient;
    if (!supabase) {
      setError("Supabase is not configured.");
      console.error("[auth-callback] supabase not configured");
      return;
    }
    const setSessionFromHash = async () => {
      if (typeof window === "undefined") return false;
      const hash = window.location.hash || "";
      if (!hash.includes("access_token")) return false;
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
       console.log("[auth-callback] parsed hash tokens", {
        hasAccess: !!access_token,
        hasRefresh: !!refresh_token,
      });
      if (!access_token || !refresh_token) return false;
      const { error: setErr } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (setErr) {
        console.error("[auth-callback] setSession from hash failed", setErr);
        setError(setErr.message);
        return false;
      }
      console.log("[auth-callback] setSession from hash success");
      // Optionally clear hash to avoid reprocessing
      if (typeof window !== "undefined") {
        history.replaceState(null, "", window.location.pathname);
      }
      return true;
    };

    const exchangeCode = async () => {
      const code = searchParams?.get("code");
      const errorDesc = searchParams?.get("error_description");
      console.log("[auth-callback] query params", { code, errorDesc });
      if (errorDesc) {
        setError(errorDesc);
        console.error(
          "[auth-callback] error_description from query",
          errorDesc
        );
        return;
      }
      if (code) {
        const { error: exchangeErr } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) {
          setError(exchangeErr.message);
          console.error(
            "[auth-callback] exchangeCodeForSession failed",
            exchangeErr
          );
          return;
        }
        console.log("[auth-callback] exchangeCodeForSession success");
      }
    };

    const loadSession = async () => {
      const { data, error: sessionErr } = await supabase.auth.getSession();
      console.log("[auth-callback] getSession result", {
        hasSession: !!data.session,
        sessionUser: data.session?.user?.id,
        sessionErr,
      });
      if (sessionErr) {
        setError(sessionErr.message);
        console.error("[auth-callback] getSession error", sessionErr);
        return;
      }
      const session = data.session;
      if (!session) {
        setError("No active session found. Try the magic link again.");
        console.warn("[auth-callback] session is null after exchange");
        return;
      }
      try {
        // Ensure profile row exists and has a display_name; if not, seed it and redirect to setup
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", session.user.id)
          .maybeSingle();

        console.log("[auth-callback] profileRow", profileRow);
        const hasDisplayName =
          profileRow?.display_name && profileRow.display_name.trim().length > 0;

        if (!hasDisplayName) {
          const displayNameSeed = session.user.email ?? "";
          await supabase.from("profiles").upsert(
            {
              id: session.user.id,
              display_name: displayNameSeed || null,
            },
            { onConflict: "id" }
          );
          console.log(
            "[auth-callback] missing profile display_name; redirecting to profile-setup"
          );
          router.replace("/profile-setup");
          return;
        }

        const { data: memberships, error: mErr } = await supabase
          .from("hive_members")
          .select("hive_id")
          .eq("user_id", session.user.id);

        console.log("[auth-callback] memberships", memberships);
        if (mErr) {
          console.error("[auth-callback] hive_members lookup failed", mErr);
          throw mErr;
        }

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

    const run = async () => {
      const didSetFromHash = await setSessionFromHash();
      if (!didSetFromHash) {
        await exchangeCode();
      }
      await loadSession();
    };

    run();
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

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="px-6 py-8 text-center max-w-md text-sm text-slate-700">
            Signing you in...
          </div>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
