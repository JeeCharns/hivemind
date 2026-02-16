"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./useSession";

interface GuestGuardProps {
  children: ReactNode;
  /**
   * Where to redirect if authenticated
   * @default "/hives"
   */
  redirectTo?: string;
  /**
   * Fallback to show while loading or redirecting
   */
  fallback?: ReactNode;
}

/**
 * GuestGuard component for pages that should only be accessible
 * to unauthenticated users (login, register, etc.)
 * Redirects authenticated users to dashboard
 */
export function GuestGuard({
  children,
  redirectTo,
  fallback,
}: GuestGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useSession();

  // Track whether we've mounted (to avoid hydration mismatch with URL params)
  const [mounted, setMounted] = useState(false);
  // Capture logged_out state BEFORE clearing URL - persists across renders
  const [justLoggedOut, setJustLoggedOut] = useState(false);
  // Track if we have a next param (for post-logout redirect scenarios)
  const [hasNextParam, setHasNextParam] = useState(false);

  useEffect(() => {
    // Capture URL params BEFORE any clearing happens
    const urlParams = new URLSearchParams(window.location.search);
    const loggedOut = urlParams.get("logged_out");
    const nextParam = urlParams.get("next");

    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate hydration guard pattern
    setMounted(true);
    if (loggedOut) {
      setJustLoggedOut(true);
    }
    if (nextParam) {
      setHasNextParam(true);
    }
  }, []);

  useEffect(() => {
    // Wait for mount to complete before taking any action
    if (!mounted) return;

    console.log("[GuestGuard] Effect running:", {
      justLoggedOut,
      hasNextParam,
      isAuthenticated,
      isLoading,
      url: window.location.href,
    });

    // Clean up URL params if present (do this once after mount)
    const urlParams = new URLSearchParams(window.location.search);
    const hasUrlParams = urlParams.has("logged_out") || urlParams.has("next");
    if (hasUrlParams && window.history.replaceState) {
      console.log("[GuestGuard] Cleaning URL params");
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Clear returnUrl if just logged out to prevent redirect loop
    if (justLoggedOut) {
      sessionStorage.removeItem("returnUrl");
      console.log("[GuestGuard] Just logged out, showing login form");
      return;
    }

    // If there's a "next" parameter but we're unauthenticated, we already captured it
    // Just show the login form
    if (hasNextParam && !isLoading && !isAuthenticated) {
      console.log("[GuestGuard] Has next param but unauthenticated, showing login form");
      sessionStorage.removeItem("returnUrl");
      return;
    }

    if (isAuthenticated && !isLoading) {
      console.log("[GuestGuard] User authenticated, redirecting...");
      // Check for return URL first
      const returnUrl = sessionStorage.getItem("returnUrl");
      if (returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
        console.log("[GuestGuard] Redirecting to returnUrl:", returnUrl);
        sessionStorage.removeItem("returnUrl");
        router.push(returnUrl);
        return;
      }

      // Otherwise redirect to default
      console.log("[GuestGuard] Redirecting to default:", redirectTo || "/hives");
      router.push(redirectTo || "/hives");
    }
  }, [mounted, isAuthenticated, isLoading, justLoggedOut, hasNextParam, router, redirectTo]);

  // Show fallback while loading or redirecting (but not if we just logged out or have a next param)
  // When hasNextParam is true, we're likely in a post-logout redirect scenario where middleware
  // redirected an unauthenticated request to /login?next=... - we should show the login form
  if ((isLoading || isAuthenticated) && fallback && !justLoggedOut && !hasNextParam) {
    return <>{fallback}</>;
  }

  // Render children if not authenticated or just logged out
  return <>{children}</>;
}
