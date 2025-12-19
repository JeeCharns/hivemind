"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Alert from "@/app/components/alert";
import Button from "@/app/components/button";
import ImageUpload from "@/app/components/ImageUpload";
import Input from "@/app/components/input";
import Spinner from "@/app/components/spinner";

type Step = 1 | 2 | 3;

type CreateHiveResponse = {
  id: string;
  slug?: string | null;
};

/**
 * NewHiveWizard - 3-step hive creation flow
 *
 * Step 1: Collect hive details (name + optional logo)
 * Step 2: Draft invite emails (pre-create)
 * Step 3: Create hive + send invites (loading orchestration)
 */
export default function NewHiveWizard() {
  const router = useRouter();
  const inFlightRef = useRef(false);

  // Wizard state
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [inviteEmailsText, setInviteEmailsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1 validation
  const nameValid = useMemo(() => name.trim().length > 0, [name]);

  // Step 2 email parsing and validation
  const inviteEmails = useMemo(() => {
    return inviteEmailsText
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
  }, [inviteEmailsText]);

  const emailCount = inviteEmails.length;
  const emailsValid = emailCount <= 10;

  // Lightweight client-side email validation
  const hasInvalidEmails = useMemo(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return inviteEmails.some((email) => !emailRegex.test(email));
  }, [inviteEmails]);

  // Step 1: Continue to invite step
  const handleContinueToInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid) return;
    setError(null);
    setStep(2);
  };

  // Step 1: Cancel
  const handleCancel = () => {
    router.push("/hives");
  };

  // Step 2: Back to step 1
  const handleBack = () => {
    setError(null);
    setStep(1);
  };

  // Step 2: Skip invites
  const handleSkipInvites = () => {
    setInviteEmailsText("");
    handleContinueToCreate();
  };

  // Step 2: Continue to create
  const handleContinueToCreate = () => {
    setError(null);
    setStep(3);
    // Orchestration starts immediately
    handleOrchestration();
  };

  // Step 3: Orchestration (create hive + send invites)
  const handleOrchestration = async () => {
    // Guard against double-submit
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSubmitting(true);

    try {
      // 1. Create hive
      const formData = new FormData();
      formData.append("name", name.trim());
      if (logoFile) {
        formData.append("logo", logoFile);
      }

      const createResponse = await fetch("/api/hives", {
        method: "POST",
        body: formData,
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => null);
        const message =
          errorData && typeof errorData === "object" && "error" in errorData
            ? String((errorData as { error: unknown }).error)
            : "Failed to create hive";
        throw new Error(message);
      }

      const hiveData = (await createResponse.json().catch(() => null)) as
        | CreateHiveResponse
        | null;

      if (!hiveData?.id) {
        throw new Error("Hive created but response was invalid");
      }

      const hiveKey = hiveData.slug || hiveData.id;

      // 2. Send invites (if any)
      if (inviteEmails.length > 0) {
        const inviteResponse = await fetch(`/api/hives/${hiveKey}/invite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ emails: inviteEmails }),
        });

        if (!inviteResponse.ok) {
          // Hive created but invites failed - redirect to invite page with error
          const errorData = await inviteResponse.json().catch(() => null);
          const inviteError =
            errorData && typeof errorData === "object" && "error" in errorData
              ? String((errorData as { error: unknown }).error)
              : "Failed to send invites";

          // Redirect to invite page with error message via query param
          router.replace(`/hives/${hiveKey}/invite?error=${encodeURIComponent(inviteError)}`);
          return;
        }
      }

      // 3. Success - redirect to hive homepage
      router.replace(`/hives/${hiveKey}`);
    } catch (err) {
      console.error("[NewHiveWizard] Orchestration failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create hive");
      setStep(1); // Return to step 1 on failure
    } finally {
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 pb-8">
      <div className="w-full max-w-[520px] bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col items-center gap-4">
        {/* Step 1: Create Hive Details */}
        {step === 1 && (
          <>
            <div className="w-full space-y-2">
              <p className="text-xs text-slate-500">Step 1 of 3</p>
              <h1 className="text-xl font-semibold text-[#172847]">
                Create a new Hive
              </h1>
              <p className="text-sm text-slate-600">
                Add your hive name and logo to get started.
              </p>
            </div>

            {error && (
              <div className="w-full">
                <Alert variant="error">{error}</Alert>
              </div>
            )}

            <form onSubmit={handleContinueToInvite} className="w-full space-y-6">
              <div className="w-full">
                <ImageUpload
                  label="Hive Logo (optional)"
                  value={logoFile}
                  onChange={setLogoFile}
                  maxSizeMB={2}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                />
              </div>

              <Input
                label="Hive Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter hive name"
                maxLength={100}
                disabled={isSubmitting}
                required
              />

              <Button
                type="submit"
                className="w-full"
                disabled={!nameValid || isSubmitting}
              >
                Continue
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={isSubmitting}
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </form>
          </>
        )}

        {/* Step 2: Draft Invite Members */}
        {step === 2 && (
          <>
            <div className="w-full space-y-2">
              <p className="text-xs text-slate-500">Step 2 of 3</p>
              <h1 className="text-xl font-semibold text-[#172847]">
                Invite members
              </h1>
              <p className="text-sm text-slate-600">
                Add up to 10 email addresses to invite to your hive.
              </p>
            </div>

            {error && (
              <div className="w-full">
                <Alert variant="error">{error}</Alert>
              </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); handleContinueToCreate(); }} className="w-full space-y-6">
              <Input
                label="Email Addresses (comma-separated)"
                value={inviteEmailsText}
                onChange={(e) => setInviteEmailsText(e.target.value)}
                placeholder="user1@example.com, user2@example.com"
                disabled={isSubmitting}
                helperText={`Enter up to 10 email addresses separated by commas. (${emailCount} entered)`}
              />

              {hasInvalidEmails && emailCount > 0 && (
                <div className="text-sm text-red-600 px-2">
                  Some email addresses appear to be invalid. Please check the format.
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  isSubmitting ||
                  emailCount === 0 ||
                  !emailsValid ||
                  hasInvalidEmails
                }
              >
                Continue
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={isSubmitting}
                onClick={handleSkipInvites}
              >
                Skip
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={isSubmitting}
                onClick={handleBack}
              >
                Back
              </Button>
            </form>
          </>
        )}

        {/* Step 3: Creating Hive (Loading) */}
        {step === 3 && (
          <div className="w-full flex flex-col items-center gap-4 py-12">
            <div className="text-lg font-semibold text-[#172847]">
              Creating Hive...
            </div>
            <Spinner />
          </div>
        )}
      </div>
    </div>
  );
}
