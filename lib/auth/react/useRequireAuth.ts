"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "./useSession";

interface UseRequireAuthOptions {
  /**
   * Where to redirect if not authenticated
   * @default "/login"
   */
  redirectTo?: string;

  /**
   * Whether to allow rendering while loading
   * @default false (redirects immediately)
   */
  allowWhileLoading?: boolean;

  /**
   * Whether to preserve current path as return URL
   * @default true
   */
  preserveReturnUrl?: boolean;
}

/**
 * Hook for protected pages that require authentication
 * Automatically redirects unauthenticated users to login
 * Preserves intended destination for post-login redirect
 */
export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const {
    redirectTo = "/login",
    allowWhileLoading = false,
    preserveReturnUrl = true,
  } = options;

  const router = useRouter();
  const pathname = usePathname();
  const { status, isAuthenticated, isLoading } = useSession();

  useEffect(() => {
    // Don't redirect while loading (unless explicitly disabled)
    if (isLoading && allowWhileLoading) {
      return;
    }

    // Redirect if unauthenticated
    if (!isAuthenticated && !isLoading) {
      // Build redirect URL with 'next' parameter
      const returnUrl =
        preserveReturnUrl && pathname !== redirectTo ? pathname : null;

      // Validate return URL for security (prevent open redirects)
      const safeReturnUrl = validateReturnUrl(returnUrl);

      if (safeReturnUrl) {
        // Store in sessionStorage for post-login redirect
        sessionStorage.setItem("returnUrl", safeReturnUrl);

        // Add to URL as well for server-side handling
        const url = new URL(redirectTo, window.location.origin);
        url.searchParams.set("next", safeReturnUrl);
        router.push(url.pathname + url.search);
      } else {
        router.push(redirectTo);
      }
    }
  }, [
    isAuthenticated,
    isLoading,
    router,
    pathname,
    redirectTo,
    allowWhileLoading,
    preserveReturnUrl,
  ]);

  return {
    status,
    isLoading,
    isAuthenticated,
  };
}

/**
 * Validate return URL to prevent open redirects
 * Only allows same-origin paths starting with /
 */
function validateReturnUrl(url: string | null): string | null {
  if (!url) return null;

  // Must start with /
  if (!url.startsWith("/")) return null;

  // Must not start with // (protocol-relative URL)
  if (url.startsWith("//")) return null;

  // Must not contain protocol
  if (url.includes("://")) return null;

  return url;
}
