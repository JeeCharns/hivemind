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

        const errorCode =
          searchParams.get("error_code") || searchParams.get("error");

        // First, check if we already have a valid session.
        // Important: Some email clients/security scanners will open the magic link
        // more than once. Supabase will then redirect subsequent opens with
        // `otp_expired`, but the user may already be authenticated. In that case
        // we should ignore the error params and continue.
        let {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          try {
            window.history.replaceState({}, "", window.location.pathname);
          } catch {
            // Ignore history API failures.
          }

          await refresh();
          notifySessionChange();

          const returnUrl = sessionStorage.getItem("returnUrl");
          if (returnUrl) {
            sessionStorage.removeItem("returnUrl");
            router.push(returnUrl);
            return;
          }

          // Check profile status before routing
          const profileStatusResponse = await fetch("/api/profile/status");
          if (profileStatusResponse.ok) {
            const profileStatus = await profileStatusResponse.json();
            if (profileStatus.needsSetup) {
              router.push("/profile-setup");
              return;
            }
          }

          router.push("/hives");
          return;
        }

        // If we don't have a session and Supabase redirected with an error,
        // send the user back to login with a helpful error code.
        if (errorCode) {
          if (errorCode === "otp_expired") {
            router.push("/login?error=session_expired");
            return;
          }
          router.push("/login?error=auth_failed");
          return;
        }

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

        // Check profile status before routing
        const profileStatusResponse = await fetch("/api/profile/status");
        if (profileStatusResponse.ok) {
          const profileStatus = await profileStatusResponse.json();
          if (profileStatus.needsSetup) {
            router.push("/profile-setup");
            return;
          }
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
