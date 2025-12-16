"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Spinner from "@/app/components/spinner";
import { notifySessionChange } from "@/lib/auth/react/AuthProvider";
import { useSession } from "@/lib/auth/react/useSession";

/**
 * Auth callback page handles Supabase authentication redirects
 * After email verification or OAuth, users are redirected here
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const hasHandledRef = useRef(false);

  useEffect(() => {
    // In dev, effects can run more than once; exchanging the same code twice can fail
    // because Supabase clears the PKCE code verifier after a successful exchange.
    if (hasHandledRef.current) return;
    hasHandledRef.current = true;

    const handleAuthCallback = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get("code");

        const errorParam = searchParams.get("error") || searchParams.get("error_code");
        if (errorParam) {
          router.push("/login?error=auth_failed");
          return;
        }

        // First, check if we already have a valid session
        // This prevents unnecessary PKCE code exchange attempts when session exists
        // (e.g., after HMR in development or when code verifier was cleared)
        let {
          data: { session },
        } = await supabase.auth.getSession();

        // Only attempt code exchange if we don't have a session yet
        if (!session && code) {
          console.log("[Auth Callback] No existing session found, attempting code exchange");
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            console.error("Error exchanging code for session:", error);

            // Check if it's a PKCE code verifier error
            if (error.message?.includes("code verifier")) {
              console.error("PKCE code verifier missing - this usually means:");
              console.error("1. The magic link was opened in a different browser");
              console.error("2. Browser cookies/localStorage were cleared");
              console.error("3. The link was opened in incognito/private mode");
              router.push("/login?error=session_expired");
              return;
            }

            // Fall through to getSession() below; the session may already exist
            // (e.g. implicit flow) or the exchange may have succeeded in a previous run.
          }

          // Re-fetch session after code exchange
          const result = await supabase.auth.getSession();
          session = result.data.session;
        } else if (session && code) {
          console.log("[Auth Callback] Session already exists, skipping code exchange");
        }

        // Remove query params (e.g. ?code=...) after we've processed them.
        // Prevents accidental re-processing on reload.
        try {
          window.history.replaceState({}, "", window.location.pathname);
        } catch {
          // Ignore history API failures.
        }

        if (!session) {
          router.push("/login?error=auth_failed");
          return;
        }

        // Refresh session store and notify other tabs
        await refresh();
        notifySessionChange();

        // Check for stored return URL
        const returnUrl = sessionStorage.getItem("returnUrl");
        if (returnUrl) {
          sessionStorage.removeItem("returnUrl");
          router.push(returnUrl);
          return;
        }

        // Default redirect to hives page
        router.push("/hives");
      } catch (error) {
        console.error("Auth callback error:", error);
        router.push("/login?error=auth_failed");
      }
    };

    void handleAuthCallback();
  }, [router, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
      <div className="flex flex-col items-center gap-4">
        <Spinner />
        <p className="text-sm text-[#566175]">Completing authentication...</p>
      </div>
    </div>
  );
}
