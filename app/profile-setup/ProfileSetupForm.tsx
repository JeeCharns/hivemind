/**
 * ProfileSetupForm - Client Component
 *
 * Wrapper for ProfileForm with redirect to hives on success
 * Used in profile setup onboarding flow
 */

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import ProfileForm from "@/app/components/profile/ProfileForm";

interface ProfileSetupFormProps {
  initialDisplayName?: string | null;
  initialAvatarUrl?: string | null;
}

export default function ProfileSetupForm({
  initialDisplayName,
  initialAvatarUrl,
}: ProfileSetupFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSuccess = () => {
    const redirectTo = searchParams.get("redirect") || "/hives";
    router.push(redirectTo);
  };

  return (
    <ProfileForm
      initialDisplayName={initialDisplayName}
      initialAvatarUrl={initialAvatarUrl}
      submitLabel="Continue"
      onSuccess={handleSuccess}
    />
  );
}
