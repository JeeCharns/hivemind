"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowserClient;
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setError(error.message);
        return;
      }
      if (data.session) {
        router.replace("/hives");
      } else {
        setError("No active session found. Try the magic link again.");
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-8 text-center max-w-md">
        <div className="text-sm text-slate-700">
          {error ? error : "Signing you in..."}
        </div>
      </div>
    </div>
  );
}
