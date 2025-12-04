"use client";

import { useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import BrandLogo from "./brand-logo";

export default function AuthGate() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseBrowserClient) {
      setError("Supabase is not configured.");
      return;
    }
    const trimmed = email.trim();
    if (!trimmed || !/\S+@\S+\.\S+/.test(trimmed)) {
      setError("Enter a valid email.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: signError } =
        await supabaseBrowserClient.auth.signInWithOtp({
          email: trimmed,
          options: {
            emailRedirectTo: `${origin || ""}/auth/callback`,
          },
        });
      if (signError) {
        throw signError;
      }
      setMessage("Check your email for a magic link.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send link";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 flex flex-col items-center justify-center gap-10">
      <div className="flex justify-center">
        <BrandLogo />
      </div>
      <div className="w-full max-w-md">
        <div
          className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-4"
          suppressHydrationWarning
        >
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 pb-3">
              Sign in / Create Account
            </h1>
            <p className="text-sm text-slate-600">
              Use your email to receive a magic link. We&apos;ll figure out the
              rest.
            </p>
          </div>
          <form className="space-y-3" onSubmit={submit}>
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
                placeholder="you@example.com"
                required
              />
            </label>
            <button
              type="submit"
              disabled={loading || email.trim().length === 0}
              className="w-full h-10 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
          {message && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              {message}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
