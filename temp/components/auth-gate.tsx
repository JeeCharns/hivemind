"use client";

import { useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import BrandLogo from "./brand-logo";
import Alert from "@/components/alert";
import CenteredCard from "@/components/centered-card";
import Button from "@/components/button";

export default function AuthGate() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseBrowserClient) {
      setError("Supabase is not configured.");
      console.error("[auth-gate] supabase not configured");
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
      console.log("[auth-gate] sending magic link", {
        email: trimmed,
        redirect: `${origin || ""}/auth/callback`,
      });
      const { error: signError } = await supabaseBrowserClient.auth.signInWithOtp({
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
      console.error("[auth-gate] signInWithOtp failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#F0F0F5] flex items-center justify-center px-4"
      suppressHydrationWarning
    >
      <div className="relative w-full max-w-md flex flex-col items-center">
        <BrandLogo
          size={40}
          className="absolute -top-14 left-1/2 -translate-x-1/2 h-auto w-auto"
        />
        <CenteredCard widthClass="max-w-md" className="pt-6">
          <div className="space-y-4" suppressHydrationWarning>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 pb-3">
                Sign in / Create Account
              </h1>
              <p className="text-sm text-slate-600">
                Use your email to receive a magic link. We&apos;ll figure out
                the rest.
              </p>
            </div>
            <form
              className="space-y-3"
              onSubmit={submit}
              suppressHydrationWarning
            >
              <label
                className="flex flex-col gap-2 text-sm text-slate-700"
                suppressHydrationWarning
              >
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
                  placeholder="you@example.com"
                  required
                  suppressHydrationWarning
                />
              </label>
              <Button
                type="submit"
                disabled={loading || email.trim().length === 0}
                className="w-full"
              >
                {loading ? "Sending…" : "Send magic link"}
              </Button>
            </form>
            {message && <Alert variant="success">{message}</Alert>}
            {error && <Alert variant="error">{error}</Alert>}
          </div>
        </CenteredCard>
      </div>
    </div>
  );
}
