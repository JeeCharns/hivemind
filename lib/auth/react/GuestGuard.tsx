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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate hydration guard pattern
    setMounted(true);
  }, []);

  // Only read URL params after mount to avoid hydration mismatch
  // (server renders with false, client may have different URL params)
  const justLoggedOut =
    mounted &&
    Boolean(new URLSearchParams(window.location.search).get("logged_out"));

  const hasNextParam =
    mounted &&
    Boolean(new URLSearchParams(window.location.search).get("next"));

  useEffect(() => {
    // Check if user just logged out (prevents redirect loop)
    const urlParams = new URLSearchParams(window.location.search);
    const loggedOut = urlParams.get("logged_out");
    const nextParam = urlParams.get("next");

    console.log("[GuestGuard] Effect running:", {
      loggedOut,
      nextParam,
      isAuthenticated,
      isLoading,
      justLoggedOut,
      url: window.location.href,
    });

    if (loggedOut) {
      console.log("[GuestGuard] Detected logged_out param, clearing state");
      // Note: justLoggedOut state is already initialized from URL param
      // Clear any returnUrl to prevent redirect loop
      sessionStorage.removeItem("returnUrl");

      // Clean up the URL without causing navigation
      if (window.history.replaceState) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      }
      return;
    }

    // Don't redirect if we just logged out, even if session still shows authenticated
    if (justLoggedOut) {
      console.log("[GuestGuard] Just logged out, skipping redirect");
      return;
    }

    // If there's a "next" parameter but we're unauthenticated, ignore it after logout
    if (nextParam && !isLoading && !isAuthenticated) {
      console.log("[GuestGuard] Found 'next' param but unauthenticated, clearing URL");
      // Check if this might be a post-logout redirect loop
      // Clear the next parameter to show the login form
      if (window.history.replaceState) {
        window.history.replaceState({}, "", window.location.pathname);
      }
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
  }, [isAuthenticated, isLoading, justLoggedOut, router, redirectTo]);

  // Show fallback while loading or redirecting (but not if we just logged out or have a next param)
  // When hasNextParam is true, we're likely in a post-logout redirect scenario where middleware
  // redirected an unauthenticated request to /login?next=... - we should show the login form
  if ((isLoading || isAuthenticated) && fallback && !justLoggedOut && !hasNextParam) {
    return <>{fallback}</>;
  }

  // Render children if not authenticated or just logged out
  return <>{children}</>;
}
