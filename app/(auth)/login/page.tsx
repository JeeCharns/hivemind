"use client";

import { useEffect, useRef, useState } from "react";
import LoginForm from "../components/LoginForm";
import { useAuth } from "../hooks/useAuth";
import AuthError from "../components/AuthError";
import CenteredCard from "../../components/centered-card";
import BrandLogo from "../../components/brand-logo";
import Spinner from "../../components/spinner";
import { GuestGuard } from "@/lib/auth/react/GuestGuard";

export default function Page() {
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [prefetching, setPrefetching] = useState(true);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);
  const [cooldownMode, setCooldownMode] = useState<
    "sent" | "rate_limit" | null
  >(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const intervalRef = useRef<number | null>(null);
  const { login, loading } = useAuth();

  const secondsLeft = cooldownUntilMs
    ? Math.max(0, Math.ceil((cooldownUntilMs - nowMs) / 1000))
    : 0;
  const isCoolingDown = secondsLeft > 0;

  useEffect(() => {
    // Simulate prefetch/load to show spinner
    const t = setTimeout(() => setPrefetching(false), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!cooldownUntilMs) return;

    intervalRef.current = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [cooldownUntilMs]);

  const handleLogin = async (email: string) => {
    if (isCoolingDown) return;

    try {
      // Clear any previous state
      setError(null);
      setStatusMessage(null);
      setCooldownMode(null);
      setCooldownUntilMs(null);

      await login(email, "");
      setStatusMessage(`Magic link sent to ${email}. Check your inbox.`);
      setCooldownMode("sent");
      setCooldownUntilMs(Date.now() + 30_000);
    } catch (err) {
      const parsed = getMagicLinkError(err);
      if (parsed.isRateLimit) {
        setStatusMessage(null);
        setError(null);
        setCooldownMode("rate_limit");
        setCooldownUntilMs(Date.now() + 30_000);
        return;
      }
      setError(parsed.message);
      setCooldownMode(null);
      setCooldownUntilMs(null);
    }
  };

  const errorToShow =
    cooldownMode === "rate_limit" && isCoolingDown
      ? `Too many requests. Please wait ${secondsLeft}s and try again.`
      : error;

  return (
    <GuestGuard
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F0F0F5]">
          <Spinner />
        </div>
      }
    >
      <div className="min-h-screen w-full bg-[#F0F0F5] flex flex-col items-center justify-center relative overflow-hidden px-4 py-12">
        <div className="mb-12">
          <BrandLogo size={42} />
        </div>

        <CenteredCard
          className="items-center gap-4 shadow-md border border-[#E2E8F0] p-8"
          widthClass="max-w-full"
          /* Inline width to avoid arbitrary-class issues */
          style={{ width: 473, maxWidth: "100%" }}
        >
          {prefetching ? (
            <div className="w-full flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <>
              <h1
                className="text-center text-[#172847] text-2xl font-semibold leading-[31px]"
                style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}
              >
                Sign Up or Create Account
              </h1>
              <p
                className="text-center text-[#566175] text-sm leading-[19.6px] max-w-md"
                style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}
              >
                Let us know your email address, click the link we send you and
                we&apos;ll do the rest!
              </p>

              {errorToShow && (
                <div className="w-full">
                  <AuthError message={errorToShow} />
                </div>
              )}

              {statusMessage && (
                <div className="w-full text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  <p>{statusMessage}</p>
                </div>
              )}

              <div className="w-full space-y-3">
                <LoginForm
                  onSubmit={handleLogin}
                  loading={loading}
                  disabled={isCoolingDown}
                  buttonText={
                    isCoolingDown
                      ? cooldownMode === "rate_limit"
                        ? `Try again in ${secondsLeft}s`
                        : "Check your email"
                      : "Send a magic link"
                  }
                />
              </div>
            </>
          )}
        </CenteredCard>
      </div>
    </GuestGuard>
  );
}

function getMagicLinkError(err: unknown): {
  message: string;
  isRateLimit: boolean;
} {
  const message = err instanceof Error ? err.message : "";

  const statusValue =
    typeof err === "object" && err
      ? (err as Record<string, unknown>).status
      : null;
  const status = typeof statusValue === "number" ? statusValue : null;

  const codeValue =
    typeof err === "object" && err
      ? (err as Record<string, unknown>).code
      : null;
  const code = typeof codeValue === "string" ? codeValue : null;

  if (
    status === 429 ||
    code === "over_email_send_rate_limit" ||
    message.toLowerCase().includes("rate limit")
  ) {
    return {
      message: "Too many requests.",
      isRateLimit: true,
    };
  }

  if (message.toLowerCase().includes("redirect")) {
    return {
      message:
        "Login redirect URL isn't allowed. Check Supabase redirect URL settings.",
      isRateLimit: false,
    };
  }

  return {
    message: message || "Failed to send magic link.",
    isRateLimit: false,
  };
}
