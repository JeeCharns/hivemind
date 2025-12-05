"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCurrentUser } from "@/lib/utils/use-current-user";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: userLoading } = useCurrentUser();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    console.log("[auth-guard] user state", { userLoading, user, pathname });
    if (userLoading) {
      setChecking(true);
      return;
    }

    if (user) {
      setTimeout(() => setChecking(false), 0);
      return;
    }

    // No user and not loading: render a missing session state (no redirect to avoid race)
    setChecking(false);
  }, [router, user, userLoading, pathname]);

  if (userLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-slate-500">Checking authentication…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-red-600">
          Session missing. Please sign in again.
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
