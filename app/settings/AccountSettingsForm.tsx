/**
 * AccountSettingsForm - Client Component
 *
 * Wrapper for ProfileForm with account-specific settings
 * Shows email (read-only) and profile update form
 */

"use client";

import ProfileForm from "@/app/components/profile/ProfileForm";
import { useRouter } from "next/navigation";

interface AccountSettingsFormProps {
  email: string;
  initialDisplayName?: string | null;
  initialAvatarUrl?: string | null;
}

export default function AccountSettingsForm({
  email,
  initialDisplayName,
  initialAvatarUrl,
}: AccountSettingsFormProps) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      {/* Account Section - Email (Read-only) */}
      <div className="space-y-4">
        <h2 className="text-h4 text-slate-900">Account</h2>
        <div className="space-y-2">
          <label className="block text-subtitle text-slate-700">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full h-10 border border-slate-300 rounded-md px-3 text-body text-slate-500 bg-slate-50 cursor-not-allowed"
          />
          <p className="text-info text-slate-500">
            Contact support to change your email address
          </p>
        </div>
      </div>

      {/* Profile Section - Display Name + Avatar */}
      <div className="space-y-4">
        <h2 className="text-h4 text-slate-900">Profile</h2>
        <ProfileForm
          initialDisplayName={initialDisplayName}
          initialAvatarUrl={initialAvatarUrl}
          submitLabel="Save Changes"
          successMessage="Profile updated successfully"
          apiEndpoint="/api/account/profile"
          showSuccessMessage={true}
          onSuccess={() => router.refresh()}
        />
      </div>
    </div>
  );
}
