"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import LoginForm from "../components/LoginForm";
import OtpInput from "../components/OtpInput";
import { useAuth } from "../hooks/useAuth";
import AuthError from "../components/AuthError";
import CenteredCard from "../../components/centered-card";
import BrandLogo from "../../components/brand-logo";
import Spinner from "../../components/spinner";
import { GuestGuard } from "@/lib/auth/react/GuestGuard";

type Step = "email" | "otp";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const intent = searchParams?.get("intent");
  const inviteToken = searchParams?.get("invite");
  const hiveNameParam = searchParams?.get("hiveName");

  const [step, setStep] = useState<Step>("email");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [prefetching, setPrefetching] = useState(true);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hiveName, setHiveName] = useState<string | null>(hiveNameParam);
  const intervalRef = useRef<number | null>(null);
  const { sendOtp, verifyOtp, loading } = useAuth();

  const secondsLeft = cooldownUntilMs
    ? Math.max(0, Math.ceil((cooldownUntilMs - nowMs) / 1000))
    : 0;
  const isCoolingDown = secondsLeft > 0;

  // Store invite token in cookie so it survives the auth flow
  useEffect(() => {
    if (inviteToken) {
      fetch("/api/auth/invite-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      }).catch(() => {
        // Best-effort; routing will still check the cookie
      });
    }
  }, [inviteToken]);

  // Fallback: fetch hive name from API if not provided in URL
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

  const handleSendOtp = async (email: string) => {
    if (isCoolingDown) return;

    try {
      setError(null);
      await sendOtp(email);
      setSubmittedEmail(email);
      setStep("otp");
      setCooldownUntilMs(Date.now() + 30_000);
    } catch (err) {
      const parsed = getOtpError(err);
      if (parsed.isRateLimit) {
        setCooldownUntilMs(Date.now() + 30_000);
        setError("Too many requests. Please wait and try again.");
        return;
      }
      setError(parsed.message);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    try {
      setError(null);
      await verifyOtp(submittedEmail, code);

      // Successful verification - route to appropriate destination
      await routeAfterAuth();
    } catch (err) {
      const parsed = getOtpError(err);
      setOtp(""); // Clear input on error
      setError(parsed.message);
    }
  };

  const routeAfterAuth = async () => {
    // Check for invite token
    try {
      const inviteContextResponse = await fetch("/api/auth/invite-context");
      if (inviteContextResponse.ok) {
        const { token } = await inviteContextResponse.json();
        if (token) {
          router.push(`/invite/${token}`);
          return;
        }
      }
    } catch {
      // Continue to other checks
    }

    // Check profile status
    try {
      const profileStatusResponse = await fetch("/api/profile/status");
      if (profileStatusResponse.ok) {
        const profileStatus = await profileStatusResponse.json();
        if (profileStatus.needsSetup) {
          router.push("/profile-setup");
          return;
        }
      }
    } catch {
      // Default to hives
    }

    router.push("/hives");
  };

  const handleResendOtp = async () => {
    if (isCoolingDown) return;

    try {
      setError(null);
      setOtp("");
      await sendOtp(submittedEmail);
      setCooldownUntilMs(Date.now() + 30_000);
    } catch (err) {
      const parsed = getOtpError(err);
      setError(parsed.message);
    }
  };

  const handleChangeEmail = () => {
    setStep("email");
    setSubmittedEmail("");
    setOtp("");
    setError(null);
    setCooldownUntilMs(null);
  };

  const handleOtpComplete = (code: string) => {
    void handleVerifyOtp(code);
  };

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
          style={{ width: 473, maxWidth: "100%" }}
        >
          {prefetching ? (
            <div className="w-full flex justify-center py-8">
              <Spinner />
            </div>
          ) : step === "email" ? (
            <>
              <h1 className="text-center text-text-primary text-h2 font-display">
                {intent === "join" && hiveName
                  ? `Enter your email address to join ${hiveName}`
                  : "Sign Up or Create Account"}
              </h1>
              <p className="text-center text-text-secondary text-body max-w-md font-display">
                Enter your email address and we&apos;ll send you a verification
                code.
              </p>

              {error && (
                <div className="w-full">
                  <AuthError message={error} />
                </div>
              )}

              <div className="w-full space-y-3">
                <LoginForm
                  onSubmit={handleSendOtp}
                  loading={loading}
                  disabled={isCoolingDown}
                  buttonText={
                    isCoolingDown
                      ? `Try again in ${secondsLeft}s`
                      : "Send verification code"
                  }
                />
              </div>
            </>
          ) : (
            <>
              <h1 className="text-center text-text-primary text-h2 font-display">
                Enter your code
              </h1>
              <p className="text-center text-text-secondary text-body max-w-md font-display">
                We sent a 6-digit code to{" "}
                <span className="font-semibold">{submittedEmail}</span>
              </p>

              {error && (
                <div className="w-full">
                  <AuthError message={error} />
                </div>
              )}

              <div className="w-full py-4">
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  onComplete={handleOtpComplete}
                  disabled={loading}
                  error={!!error}
                />
              </div>

              <div className="w-full flex flex-col items-center gap-2 text-sm">
                <p className="text-text-secondary">
                  Didn&apos;t receive the code?{" "}
                  {isCoolingDown ? (
                    <span className="text-text-disabled">
                      Resend in {secondsLeft}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={loading}
                      className="text-brand-primary hover:underline disabled:opacity-50"
                    >
                      Resend code
                    </button>
                  )}
                </p>
                <button
                  type="button"
                  onClick={handleChangeEmail}
                  disabled={loading}
                  className="text-brand-primary hover:underline disabled:opacity-50"
                >
                  Change email
                </button>
              </div>
            </>
          )}
        </CenteredCard>
      </div>
    </GuestGuard>
  );
}

function getOtpError(err: unknown): {
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

  // Handle invalid/expired OTP errors
  if (
    code === "otp_expired" ||
    message.toLowerCase().includes("expired")
  ) {
    return {
      message: "Code expired. Please request a new one.",
      isRateLimit: false,
    };
  }

  if (
    message.toLowerCase().includes("invalid") ||
    message.toLowerCase().includes("incorrect")
  ) {
    return {
      message: "Invalid code. Please check and try again.",
      isRateLimit: false,
    };
  }

  if (!message) {
    return {
      message: "Something went wrong. Please try again.",
      isRateLimit: false,
    };
  }

  return { message, isRateLimit: false };
}

export default function LoginPageClient() {
  return <LoginPageContent />;
}
