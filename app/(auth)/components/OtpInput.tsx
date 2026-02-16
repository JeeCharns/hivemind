"use client";

import { useRef, useCallback, KeyboardEvent, ClipboardEvent, ChangeEvent } from "react";

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

  const focusInput = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, length - 1));
    inputRefs.current[clampedIndex]?.focus();
  }, [length]);

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
    <div className="flex gap-2 justify-center" role="group" aria-label="One-time password input">
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
