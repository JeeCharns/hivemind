"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Alert from "@/app/components/alert";
import Button from "@/app/components/button";
import ImageUpload from "@/app/components/ImageUpload";
import Input from "@/app/components/input";
import HiveShareInvitePanel from "@/app/hives/components/HiveShareInvitePanel";

type Step = 1 | 2;

type HiveVisibility = "public" | "private";

type CreatedHive = {
  id: string;
  slug?: string | null;
};

/**
 * NewHiveWizard - 2-step hive creation flow
 *
 * Step 1: Collect hive details (name + optional logo + visibility)
 * Step 2: Show invite link for sharing
 */
export default function NewHiveWizard() {
  const router = useRouter();
  const inFlightRef = useRef(false);

  // Wizard state
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<HiveVisibility>("public");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdHive, setCreatedHive] = useState<CreatedHive | null>(null);

  // Step 1 validation
  const nameValid = useMemo(() => name.trim().length > 0, [name]);

  // Step 1: Create hive and continue to Step 2
  const handleCreateHive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid || inFlightRef.current) return;

    inFlightRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("visibility", visibility);
      if (logoFile) {
        formData.append("logo", logoFile);
      }

      const response = await fetch("/api/hives", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const message =
          errorData && typeof errorData === "object" && "error" in errorData
            ? String((errorData as { error: unknown }).error)
            : "Failed to create hive";
        throw new Error(message);
      }

      const hiveData = (await response
        .json()
        .catch(() => null)) as CreatedHive | null;

      if (!hiveData?.id) {
        throw new Error("Hive created but response was invalid");
      }

      setCreatedHive(hiveData);
      setStep(2);
    } catch (err) {
      console.error("[NewHiveWizard] Create hive failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create hive");
    } finally {
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  };

  // Step 1: Cancel
  const handleCancel = () => {
    router.push("/hives");
  };

  // Step 2: Go to hive
  const handleGoToHive = () => {
    if (!createdHive) return;
    const hiveKey = createdHive.slug || createdHive.id;
    router.push(`/hives/${hiveKey}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 pb-8">
      <div className="w-full max-w-[520px] bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col items-center gap-4">
        {/* Step 1: Create Hive Details */}
        {step === 1 && (
          <>
            <div className="w-full space-y-2">
              <p className="text-xs text-slate-500">Step 1 of 2</p>
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

            <form onSubmit={handleCreateHive} className="w-full space-y-6">
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

              {/* Visibility Selection */}
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-[#172847]">
                  Hive Visibility
                </label>

                <div className="flex flex-col gap-3">
                  <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="radio"
                      name="visibility"
                      value="public"
                      checked={visibility === "public"}
                      onChange={() => setVisibility("public")}
                      disabled={isSubmitting}
                      className="w-4 h-4 mt-0.5"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-[#172847]">
                        Public
                      </span>
                      <span className="text-xs text-slate-500">
                        Anyone can search for and join this hive.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="radio"
                      name="visibility"
                      value="private"
                      checked={visibility === "private"}
                      onChange={() => setVisibility("private")}
                      disabled={isSubmitting}
                      className="w-4 h-4 mt-0.5"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-[#172847]">
                        Private
                      </span>
                      <span className="text-xs text-slate-500">
                        Only people with an invite link can join. This hive
                        won&apos;t appear in search.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={!nameValid || isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Continue"}
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

        {/* Step 2: Invite Friends (Link Sharing) */}
        {step === 2 && createdHive && (
          <>
            <div className="w-full space-y-2">
              <p className="text-xs text-slate-500">Step 2 of 2</p>
              <h1 className="text-xl font-semibold text-[#172847]">
                Invite friends
              </h1>
              <p className="text-sm text-slate-600">
                Share this link to invite people to your hive.
              </p>
            </div>

            <div className="w-full">
              <HiveShareInvitePanel
                hiveKey={createdHive.slug || createdHive.id}
                isAdmin={true}
                linkOnly={true}
              />
            </div>

            <Button type="button" className="w-full" onClick={handleGoToHive}>
              Go to hive
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
