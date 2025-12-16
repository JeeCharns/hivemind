"use client";

import type { ReactNode } from "react";
import { useRequireAuth } from "./useRequireAuth";

interface AuthGuardProps {
  children: ReactNode;
  /**
   * Where to redirect if not authenticated
   * @default "/login"
   */
  redirectTo?: string;
  /**
   * Fallback to show while loading
   * If not provided, children will be rendered during loading
   */
  fallback?: ReactNode;
  /**
   * Whether to preserve return URL for post-login redirect
   * @default true
   */
  preserveReturnUrl?: boolean;
}

/**
 * AuthGuard component for protecting client-rendered content
 * Redirects to login if user is not authenticated
 * Shows fallback (or children) while checking auth
 */
export function AuthGuard({
  children,
  redirectTo = "/login",
  fallback,
  preserveReturnUrl = true,
}: AuthGuardProps) {
  const { isLoading, isAuthenticated } = useRequireAuth({
    redirectTo,
    allowWhileLoading: !!fallback,
    preserveReturnUrl,
  });

  // Show fallback while loading (if provided)
  if (isLoading && fallback) {
    return <>{fallback}</>;
  }

  // Show fallback while redirecting (if provided)
  if (!isAuthenticated && fallback) {
    return <>{fallback}</>;
  }

  // Render children if authenticated or while loading (no fallback)
  return <>{children}</>;
}
