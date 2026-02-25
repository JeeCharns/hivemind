"use client";

import { useState } from "react";
import Button from "@/app/components/button";

interface GuestMigrationPromptProps {
  guestNumber: number;
  responsesCount: number;
  likesCount: number;
  feedbackCount: number;
  onComplete: (keepAnonymous: boolean) => void;
  loading?: boolean;
}

export default function GuestMigrationPrompt({
  guestNumber,
  responsesCount,
  likesCount,
  feedbackCount,
  onComplete,
  loading = false,
}: GuestMigrationPromptProps) {
  const [keepAnonymous, setKeepAnonymous] = useState(false);

  const contributionParts = [
    responsesCount > 0 &&
      `${responsesCount} response${responsesCount !== 1 ? "s" : ""}`,
    likesCount > 0 && `${likesCount} like${likesCount !== 1 ? "s" : ""}`,
    feedbackCount > 0 &&
      `${feedbackCount} vote${feedbackCount !== 1 ? "s" : ""}`,
  ].filter(Boolean);

  const contributionText = contributionParts.join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-h3 text-text-primary mb-2">
          Welcome! We found your guest contributions
        </h2>

        <p className="text-body text-text-secondary mb-6">
          You submitted {contributionText} as Guest {guestNumber}. How would you
          like them to appear?
        </p>

        <div className="mb-6 space-y-3">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
              !keepAnonymous
                ? "border-brand-primary bg-indigo-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="attribution"
              checked={!keepAnonymous}
              onChange={() => setKeepAnonymous(false)}
              className="mt-1"
            />
            <div>
              <span className="text-subtitle text-text-primary">
                Show my name
              </span>
              <p className="text-body-sm text-text-secondary">
                Your contributions will display your name
              </p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
              keepAnonymous
                ? "border-brand-primary bg-indigo-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="attribution"
              checked={keepAnonymous}
              onChange={() => setKeepAnonymous(true)}
              className="mt-1"
            />
            <div>
              <span className="text-subtitle text-text-primary">
                Keep anonymous
              </span>
              <p className="text-body-sm text-text-secondary">
                Your contributions will show as Anonymous
              </p>
            </div>
          </label>
        </div>

        <Button
          onClick={() => onComplete(keepAnonymous)}
          disabled={loading}
          className="w-full"
        >
          {loading ? "Migrating..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
