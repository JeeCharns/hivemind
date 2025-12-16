"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/app/components/spinner";

/**
 * Logout page handles user sign out
 * Clears session and redirects to login
 */
export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    // Clear any stored return URLs to prevent redirect loops
    sessionStorage.removeItem("returnUrl");

    // Redirect to logout API
    router.replace("/api/auth/logout");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F0F5]">
      <Spinner />
    </div>
  );
}
