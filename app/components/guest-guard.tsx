"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../(auth)/hooks/useSession";
import Spinner from "./spinner";

interface GuestGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * GuestGuard component protects routes that should only be accessible
 * to unauthenticated users (login, register pages)
 * Redirects authenticated users to the dashboard or their last visited page
 */
export default function GuestGuard({
  children,
  redirectTo,
}: GuestGuardProps) {
  const router = useRouter();
  const { user, loading } = useSession();

  useEffect(() => {
    // Don't redirect while still loading
    if (loading) return;

    // Redirect authenticated users away from guest-only pages
    if (user) {
      // Check for stored return URL first
      const returnUrl = sessionStorage.getItem("returnUrl");
      if (returnUrl) {
        sessionStorage.removeItem("returnUrl");
        router.push(returnUrl);
        return;
      }

      // Otherwise use provided redirectTo or default to /hives
      router.push(redirectTo || "/hives");
    }
  }, [user, loading, router, redirectTo]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
        <div className="flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-sm text-[#566175]">Loading...</p>
        </div>
      </div>
    );
  }

  // Show loading state while redirecting authenticated users
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
        <div className="flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-sm text-[#566175]">Redirecting...</p>
        </div>
      </div>
    );
  }

  // User is not authenticated, render children
  return <>{children}</>;
}
