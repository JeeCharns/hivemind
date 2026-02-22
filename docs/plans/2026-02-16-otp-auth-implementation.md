# OTP Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace magic link authentication with OTP (one-time passcode) to fix email redirect issues and the new-tab UX problem.

**Architecture:** Modify the existing `signInWithOtp()` call to omit `emailRedirectTo`, causing Supabase to send a 6-digit code instead of a magic link. Add `verifyOtp()` to exchange the code for a session directly in the browser. Create a new `OtpInput` component for the 6-box code entry UI.

**Tech Stack:** React, Supabase Auth, TypeScript, Jest, React Testing Library

---

## Task 1: Create OtpInput Component Tests

**Files:**

- Create: `app/(auth)/components/__tests__/OtpInput.test.tsx`

**Step 1: Create test file with basic rendering test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OtpInput from "../OtpInput";

describe("OtpInput", () => {
  const defaultProps = {
    value: "",
    onChange: jest.fn(),
    onComplete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render 6 input boxes by default", () => {
      render(<OtpInput {...defaultProps} />);
      const inputs = screen.getAllByRole("textbox");
      expect(inputs).toHaveLength(6);
    });

    it("should render custom length when specified", () => {
      render(<OtpInput {...defaultProps} length={4} />);
      const inputs = screen.getAllByRole("textbox");
      expect(inputs).toHaveLength(4);
    });

    it("should display value across inputs", () => {
      render(<OtpInput {...defaultProps} value="123456" />);
      const inputs = screen.getAllByRole("textbox");
      expect(inputs[0]).toHaveValue("1");
      expect(inputs[1]).toHaveValue("2");
      expect(inputs[2]).toHaveValue("3");
      expect(inputs[3]).toHaveValue("4");
      expect(inputs[4]).toHaveValue("5");
      expect(inputs[5]).toHaveValue("6");
    });

    it("should disable all inputs when disabled prop is true", () => {
      render(<OtpInput {...defaultProps} disabled />);
      const inputs = screen.getAllByRole("textbox");
      inputs.forEach((input) => {
        expect(input).toBeDisabled();
      });
    });

    it("should apply error styling when error prop is true", () => {
      render(<OtpInput {...defaultProps} error />);
      const inputs = screen.getAllByRole("textbox");
      inputs.forEach((input) => {
        expect(input).toHaveClass("border-red-500");
      });
    });
  });

  describe("input behaviour", () => {
    it("should call onChange when digit is entered", async () => {
      const onChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={onChange} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.type(inputs[0], "1");

      expect(onChange).toHaveBeenCalledWith("1");
    });

    it("should only accept numeric input", async () => {
      const onChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={onChange} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.type(inputs[0], "a");

      expect(onChange).not.toHaveBeenCalled();
    });

    it("should call onComplete when all digits entered", async () => {
      const onComplete = jest.fn();
      let value = "";
      const onChange = jest.fn((v) => {
        value = v;
      });

      const { rerender } = render(
        <OtpInput
          {...defaultProps}
          value={value}
          onChange={onChange}
          onComplete={onComplete}
        />
      );

      const inputs = screen.getAllByRole("textbox");

      for (let i = 0; i < 6; i++) {
        await userEvent.type(inputs[i], String(i + 1));
        value = value + String(i + 1);
        rerender(
          <OtpInput
            {...defaultProps}
            value={value}
            onChange={onChange}
            onComplete={onComplete}
          />
        );
      }

      expect(onComplete).toHaveBeenCalledWith("123456");
    });
  });

  describe("paste behaviour", () => {
    it("should handle pasting full code", async () => {
      const onChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={onChange} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.click(inputs[0]);
      await userEvent.paste("123456");

      expect(onChange).toHaveBeenCalledWith("123456");
    });

    it("should handle pasting partial code", async () => {
      const onChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={onChange} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.click(inputs[0]);
      await userEvent.paste("123");

      expect(onChange).toHaveBeenCalledWith("123");
    });

    it("should ignore non-numeric paste content", async () => {
      const onChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={onChange} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.click(inputs[0]);
      await userEvent.paste("abc123");

      expect(onChange).toHaveBeenCalledWith("123");
    });
  });

  describe("keyboard navigation", () => {
    it("should move focus to next input on digit entry", async () => {
      render(<OtpInput {...defaultProps} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.type(inputs[0], "1");

      expect(inputs[1]).toHaveFocus();
    });

    it("should move focus to previous input on backspace", async () => {
      render(<OtpInput {...defaultProps} value="12" />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.click(inputs[2]);
      await userEvent.keyboard("{Backspace}");

      expect(inputs[1]).toHaveFocus();
    });

    it("should support arrow key navigation", async () => {
      render(<OtpInput {...defaultProps} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.click(inputs[2]);
      await userEvent.keyboard("{ArrowLeft}");

      expect(inputs[1]).toHaveFocus();

      await userEvent.keyboard("{ArrowRight}");

      expect(inputs[2]).toHaveFocus();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- app/\(auth\)/components/__tests__/OtpInput.test.tsx`
Expected: FAIL with "Cannot find module '../OtpInput'"

**Step 3: Commit test file**

```bash
git add app/\(auth\)/components/__tests__/OtpInput.test.tsx
git commit -m "test: add OtpInput component tests

TDD: Write failing tests for OtpInput component covering:
- Basic rendering (6 boxes, custom length, value display)
- Input behaviour (onChange, numeric-only, onComplete)
- Paste handling (full/partial code, non-numeric filtering)
- Keyboard navigation (auto-advance, backspace, arrows)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Implement OtpInput Component

**Files:**

- Create: `app/(auth)/components/OtpInput.tsx`

**Step 1: Create the OtpInput component**

```tsx
"use client";

import {
  useRef,
  useCallback,
  KeyboardEvent,
  ClipboardEvent,
  ChangeEvent,
} from "react";

type OtpInputProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
};

export default function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const focusInput = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, length - 1));
      inputRefs.current[clampedIndex]?.focus();
    },
    [length]
  );

  const handleChange = useCallback(
    (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
      const digit = e.target.value;

      // Only accept single digit
      if (!/^\d?$/.test(digit)) {
        return;
      }

      const digits = value.split("");
      digits[index] = digit;
      const newValue = digits.join("").slice(0, length);

      onChange(newValue);

      // Move focus to next input if digit was entered
      if (digit && index < length - 1) {
        focusInput(index + 1);
      }

      // Check if complete
      if (newValue.length === length) {
        onComplete(newValue);
      }
    },
    [value, length, onChange, onComplete, focusInput]
  );

  const handleKeyDown = useCallback(
    (index: number) => (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        if (!value[index] && index > 0) {
          // If current input is empty, move to previous and clear it
          const digits = value.split("");
          digits[index - 1] = "";
          onChange(digits.join(""));
          focusInput(index - 1);
          e.preventDefault();
        }
      } else if (e.key === "ArrowLeft" && index > 0) {
        focusInput(index - 1);
        e.preventDefault();
      } else if (e.key === "ArrowRight" && index < length - 1) {
        focusInput(index + 1);
        e.preventDefault();
      }
    },
    [value, length, onChange, focusInput]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData("text");
      const digits = pastedData.replace(/\D/g, "").slice(0, length);

      if (digits) {
        onChange(digits);

        // Focus appropriate input
        if (digits.length < length) {
          focusInput(digits.length);
        } else {
          focusInput(length - 1);
          onComplete(digits);
        }
      }
    },
    [length, onChange, onComplete, focusInput]
  );

  const baseInputClass =
    "w-10 h-12 text-center text-lg font-semibold border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary";
  const errorClass = error ? "border-red-500" : "border-slate-200";
  const disabledClass = disabled ? "bg-slate-100 cursor-not-allowed" : "";

  return (
    <div
      className="flex gap-2 justify-center"
      role="group"
      aria-label="One-time password input"
    >
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={value[index] || ""}
          onChange={handleChange(index)}
          onKeyDown={handleKeyDown(index)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${length}`}
          className={`${baseInputClass} ${errorClass} ${disabledClass}`}
        />
      ))}
    </div>
  );
}
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- app/\(auth\)/components/__tests__/OtpInput.test.tsx`
Expected: PASS (all tests should pass)

**Step 3: Commit implementation**

```bash
git add app/\(auth\)/components/OtpInput.tsx
git commit -m "feat: implement OtpInput component

6-box OTP input with:
- Auto-focus advancement on digit entry
- Paste support (full/partial, filters non-numeric)
- Keyboard navigation (arrows, backspace)
- Error and disabled states
- Accessible with ARIA labels

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Add verifyOtp to useAuth Hook

**Files:**

- Modify: `app/(auth)/hooks/useAuth.ts`

**Step 1: Update the useAuth hook**

Add `verifyOtp` function and update `login` to not use `emailRedirectTo`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { notifySessionChange } from "@/lib/auth/react/AuthProvider";
import { useSession } from "@/lib/auth/react/useSession";

interface UseAuthReturn {
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for authentication operations
 * Handles OTP send/verify, password login, logout, and manages auth state
 */
export const useAuth = (): UseAuthReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refresh } = useSession();

  const sendOtp = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          // No emailRedirectTo = sends 6-digit code instead of magic link
        },
      });

      if (signInError) throw signInError;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to send verification code";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOtp = useCallback(
    async (email: string, token: string) => {
      setLoading(true);
      setError(null);

      try {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "email",
        });

        if (verifyError) throw verifyError;

        // Refresh session store and notify other tabs
        await refresh();
        notifySessionChange();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to verify code";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [refresh]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);

      try {
        // For OTP authentication (empty password)
        if (!password) {
          await sendOtp(email);
          return;
        }

        // For password-based authentication
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        // Refresh session store and notify other tabs
        await refresh();
        notifySessionChange();

        // Redirect to dashboard or last visited hive
        router.push("/hives");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to login";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [refresh, router, sendOtp]
  );

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;

      // Refresh session store and notify other tabs
      await refresh();
      notifySessionChange();

      // Redirect to login
      router.push("/login");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to logout";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refresh, router]);

  return {
    sendOtp,
    verifyOtp,
    login,
    logout,
    loading,
    error,
  };
};
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors)

**Step 3: Commit changes**

```bash
git add app/\(auth\)/hooks/useAuth.ts
git commit -m "feat: add sendOtp and verifyOtp to useAuth hook

- sendOtp: calls signInWithOtp without emailRedirectTo (sends code)
- verifyOtp: exchanges code for session using verifyOtp
- login: updated to use sendOtp for empty password
- Session refresh and tab sync handled after verification

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update LoginPageClient for OTP Flow

**Files:**

- Modify: `app/(auth)/login/LoginPageClient.tsx`

**Step 1: Rewrite LoginPageClient with OTP flow**

```tsx
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
import { useSession } from "@/lib/auth/react/useSession";

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
  const { refresh } = useSession();

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
  if (code === "otp_expired" || message.toLowerCase().includes("expired")) {
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
```

**Step 2: Update LoginForm button text**

Modify `app/(auth)/components/LoginForm.tsx` line 46 to use the new default:

```tsx
{
  loading ? "Sending..." : (buttonText ?? "Send verification code");
}
```

**Step 3: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

**Step 4: Commit changes**

```bash
git add app/\(auth\)/login/LoginPageClient.tsx app/\(auth\)/components/LoginForm.tsx
git commit -m "feat: implement OTP login flow

- Add step state to switch between email and OTP entry
- Integrate OtpInput component for 6-digit code entry
- Auto-submit on OTP completion
- Add resend with cooldown and change email options
- Route to appropriate destination after verification
- Update error handling for OTP-specific errors
- Update LoginForm default button text

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Run Full Test Suite and Manual Testing

**Files:**

- None (verification only)

**Step 1: Run all tests**

Run: `npm test`
Expected: PASS (all tests should pass)

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 4: Start dev server for manual testing**

Run: `npm run dev`

**Step 5: Manual testing checklist**

Test in browser at `http://localhost:3000/login`:

- [ ] Email entry page displays correctly
- [ ] Submitting email transitions to OTP entry
- [ ] OTP boxes display and accept digits
- [ ] Pasting full code works
- [ ] Backspace navigation works
- [ ] Auto-submit triggers on 6th digit
- [ ] Invalid code shows error and clears input
- [ ] Expired code shows appropriate message
- [ ] Resend works with cooldown
- [ ] Change email returns to email entry
- [ ] Successful verification redirects to /hives
- [ ] Invite flow: login with invite token routes to /invite/{token}
- [ ] Profile setup: new user routes to /profile-setup

**Step 6: Commit any fixes from testing**

If fixes needed, commit with appropriate message.

---

## Task 6: Update Documentation

**Files:**

- Modify: `lib/auth/README.md`
- Modify: `docs/feature-map.md`

**Step 1: Update lib/auth/README.md**

Add note about OTP authentication change in the Auth Flows section:

```markdown
## Auth Flows

### OTP Authentication (Primary)

1. User enters email on `/login`
2. `sendOtp()` calls Supabase `signInWithOtp()` (no redirect URL = sends code)
3. User enters 6-digit code on same page
4. `verifyOtp()` exchanges code for session
5. Session stored in cookies, user redirected to destination

### Password Authentication

[existing content]
```

**Step 2: Update docs/feature-map.md**

Update login flow section to reflect OTP:

```markdown
### Login Flow

| Step          | File                                   | Description                       |
| ------------- | -------------------------------------- | --------------------------------- |
| Email entry   | `app/(auth)/login/LoginPageClient.tsx` | Email form, sends OTP             |
| OTP entry     | `app/(auth)/login/LoginPageClient.tsx` | 6-digit code input                |
| OTP component | `app/(auth)/components/OtpInput.tsx`   | 6-box input with paste/navigation |
| Auth hook     | `app/(auth)/hooks/useAuth.ts`          | sendOtp, verifyOtp functions      |
| Session       | `lib/auth/react/AuthProvider.tsx`      | Session refresh after verify      |
```

**Step 3: Commit documentation**

```bash
git add lib/auth/README.md docs/feature-map.md
git commit -m "docs: update auth documentation for OTP flow

- Document OTP authentication as primary flow
- Update feature-map with OTP-related files
- Remove magic link references

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

| Task | Description              | Files                                                                         |
| ---- | ------------------------ | ----------------------------------------------------------------------------- |
| 1    | Write OtpInput tests     | `app/(auth)/components/__tests__/OtpInput.test.tsx`                           |
| 2    | Implement OtpInput       | `app/(auth)/components/OtpInput.tsx`                                          |
| 3    | Add verifyOtp to useAuth | `app/(auth)/hooks/useAuth.ts`                                                 |
| 4    | Update LoginPageClient   | `app/(auth)/login/LoginPageClient.tsx`, `app/(auth)/components/LoginForm.tsx` |
| 5    | Run tests and manual QA  | (verification)                                                                |
| 6    | Update documentation     | `lib/auth/README.md`, `docs/feature-map.md`                                   |
