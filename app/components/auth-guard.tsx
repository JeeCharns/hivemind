"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "../(auth)/hooks/useSession";
import Spinner from "./spinner";

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * AuthGuard component protects routes that require authentication
 * Redirects unauthenticated users to login page
 * Shows loading state while checking authentication
 */
export default function AuthGuard({
  children,
  redirectTo = "/login",
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useSession();

  useEffect(() => {
    // Don't redirect while still loading
    if (loading) return;

    // Redirect to login if no user
    if (!user) {
      // Store the intended destination for post-login redirect
      const returnUrl = pathname !== redirectTo ? pathname : "/hives";
      sessionStorage.setItem("returnUrl", returnUrl);
      router.push(redirectTo);
    }
  }, [user, loading, router, pathname, redirectTo]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
        <div className="flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-sm text-[#566175]">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Show loading state while redirecting
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
        <div className="flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-sm text-[#566175]">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // User is authenticated, render children
  return <>{children}</>;
}
