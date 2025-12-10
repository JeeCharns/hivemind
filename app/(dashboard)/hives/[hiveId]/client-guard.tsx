"use client";

import { useEffect } from "react";
import { useCurrentUser } from "@/lib/utils/use-current-user";
import Link from "next/link";

export default function HiveClientGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useCurrentUser();
  useEffect(() => {
    console.log("[HiveClientGuard] mounted");
    return () => console.log("[HiveClientGuard] unmounted");
  }, []);

  console.log("[hive-client-guard] render state", {
    loading,
    userId: user?.id,
  });

  if (loading) {
    return (
      <div className="min-h-[200px] flex items-center justify-center text-sm text-slate-600">
        Loading your session…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-60` flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Session missing
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            We couldn&apos;t verify your session. Please sign in again to
            continue.
          </p>
          <div className="flex justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
            >
              Go to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
