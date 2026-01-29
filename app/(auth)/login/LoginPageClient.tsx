"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import LoginForm from "../components/LoginForm";
import { useAuth } from "../hooks/useAuth";
import AuthError from "../components/AuthError";
import CenteredCard from "../../components/centered-card";
import BrandLogo from "../../components/brand-logo";
import Spinner from "../../components/spinner";
import { GuestGuard } from "@/lib/auth/react/GuestGuard";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const intent = searchParams?.get("intent");
  const inviteToken = searchParams?.get("invite");
  const hiveNameParam = searchParams?.get("hiveName");

  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [prefetching, setPrefetching] = useState(true);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);
  const [cooldownMode, setCooldownMode] = useState<
    "sent" | "rate_limit" | null
  >(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hiveName, setHiveName] = useState<string | null>(hiveNameParam);
  const intervalRef = useRef<number | null>(null);
  const { login, loading } = useAuth();

  const secondsLeft = cooldownUntilMs
    ? Math.max(0, Math.ceil((cooldownUntilMs - nowMs) / 1000))
    : 0;
  const isCoolingDown = secondsLeft > 0;

  // Store invite token in cookie so it survives the OAuth/magic-link redirect
  useEffect(() => {
    if (inviteToken) {
      fetch("/api/auth/invite-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      }).catch(() => {
        // Best-effort; callback page will still check the cookie
      });
    }
  }, [inviteToken]);

  // Fallback: fetch hive name from API if not provided in URL (e.g., old bookmarked links)
  useEffect(() => {
    if (intent === "join" && inviteToken && !hiveNameParam) {
      fetch(`/api/invites/${inviteToken}/preview`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.hiveName) {
            setHiveName(data.hiveName);
          }
        })
        .catch(() => {
          // Silently fail - will show default header
        });
    }
  }, [intent, inviteToken, hiveNameParam]);

  useEffect(() => {
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
          <BrandLogo size={32} />
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
              <h1 className="text-center text-text-primary text-h2 font-display">
                {intent === "join" && hiveName
                  ? `Enter your email address to join ${hiveName}`
                  : "Sign Up or Create Account"}
              </h1>
              <p className="text-center text-text-secondary text-body max-w-md font-display">
                Let us know your email address, click the link we send you and
                we&apos;ll do the rest!
              </p>

              {errorToShow && (
                <div className="w-full">
                  <AuthError message={errorToShow} />
                </div>
              )}

              {statusMessage && (
                <div className="w-full text-body text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
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
    return { message: "", isRateLimit: true };
  }

  if (!message) {
    return {
      message: "Failed to send magic link. Please try again.",
      isRateLimit: false,
    };
  }

  return { message, isRateLimit: false };
}

export default function LoginPageClient() {
  return <LoginPageContent />;
}
