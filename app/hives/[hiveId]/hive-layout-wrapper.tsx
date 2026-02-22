"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/lib/auth/react/AuthGuard";
import Spinner from "@/app/components/spinner";

interface HiveLayoutWrapperProps {
  children: ReactNode;
}

/**
 * Client-side wrapper for hive layouts
 * Provides authentication protection for all hive pages
 */
export default function HiveLayoutWrapper({
  children,
}: HiveLayoutWrapperProps) {
  return (
    <AuthGuard
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
          <Spinner />
        </div>
      }
    >
      {children}
    </AuthGuard>
  );
}
