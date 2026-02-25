"use client";

import { useState } from "react";
import Button from "@/app/components/button";
import ImageUpload from "@/app/components/ImageUpload";
import BrandLogo from "@/app/components/brand-logo";

interface GuestMigrationPromptProps {
  guestNumber: number;
  responsesCount: number;
  likesCount: number;
  feedbackCount: number;
  onComplete: (keepAnonymous: boolean) => void;
  loading?: boolean;
}

type Step = "profile" | "attribution";

export default function GuestMigrationPrompt({
  guestNumber,
  responsesCount,
  likesCount,
  feedbackCount,
  onComplete,
  loading = false,
}: GuestMigrationPromptProps) {
  const [step, setStep] = useState<Step>("profile");
  const [keepAnonymous, setKeepAnonymous] = useState(false);

  // Profile form state
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const contributionParts = [
    responsesCount > 0 &&
      `${responsesCount} response${responsesCount !== 1 ? "s" : ""}`,
    likesCount > 0 && `${likesCount} like${likesCount !== 1 ? "s" : ""}`,
    feedbackCount > 0 &&
      `${feedbackCount} vote${feedbackCount !== 1 ? "s" : ""}`,
  ].filter(Boolean);

  const contributionText = contributionParts.join(", ");

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileLoading(true);

    try {
      const formData = new FormData();
      formData.append("displayName", displayName.trim());
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const response = await fetch("/api/profile", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? "Failed to save profile");
      }

      // Move to attribution step
      setStep("attribution");
    } catch (err) {
      console.error("[GuestMigrationPrompt] Profile error:", err);
      setProfileError(
        err instanceof Error ? err.message : "Failed to save profile"
      );
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F0F0F5]">
      {/* Header */}
      <div className="flex justify-center py-8">
        <BrandLogo size={32} />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 pb-12 overflow-y-auto">
        <div className="w-full max-w-[480px] bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          {step === "profile" ? (
            <>
              {/* Profile Step Header */}
              <div className="text-center space-y-2 mb-8">
                <h1 className="text-2xl font-semibold text-[#172847]">
                  Welcome! Let&apos;s set up your profile
                </h1>
                <p className="text-sm text-[#566175] leading-relaxed">
                  We found {contributionText} from your session as Guest{" "}
                  {guestNumber}. First, tell us a bit about yourself.
                </p>
              </div>

              {/* Profile Form */}
              <form onSubmit={handleProfileSubmit} className="space-y-6">
                {/* Display Name Input */}
                <div className="space-y-2">
                  <label
                    htmlFor="displayName"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    required
                    maxLength={60}
                    className="w-full h-10 border border-slate-300 rounded-md px-3 text-sm text-slate-700 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
                    disabled={profileLoading}
                  />
                  <p className="text-xs text-slate-500">
                    This is how others will see you in the app
                  </p>
                </div>

                {/* Avatar Upload */}
                <ImageUpload
                  label="Profile Picture (optional)"
                  value={avatarFile}
                  onChange={setAvatarFile}
                  maxSizeMB={2}
                />

                {/* Error Display */}
                {profileError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {profileError}
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={profileLoading || !displayName.trim()}
                >
                  {profileLoading ? "Saving..." : "Continue"}
                </Button>
              </form>
            </>
          ) : (
            <>
              {/* Attribution Step Header */}
              <div className="text-center space-y-2 mb-8">
                <h1 className="text-2xl font-semibold text-[#172847]">
                  Link your contributions
                </h1>
                <p className="text-sm text-[#566175] leading-relaxed">
                  You submitted {contributionText} as Guest {guestNumber}. How
                  would you like them to appear?
                </p>
              </div>

              {/* Attribution Options */}
              <div className="space-y-3 mb-8">
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
                      Show as {displayName}
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

              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
                  onClick={() => onComplete(keepAnonymous)}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? "Linking contributions..." : "Complete setup"}
                </Button>
                <button
                  type="button"
                  onClick={() => setStep("profile")}
                  disabled={loading}
                  className="w-full text-sm text-slate-500 hover:text-slate-700"
                >
                  Back to profile
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
