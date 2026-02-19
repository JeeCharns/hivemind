/**
 * AccountSettingsForm - Client Component
 *
 * Wrapper for ProfileForm with account-specific settings
 * Shows email (read-only), profile update form, and notification preferences
 */

"use client";

import ProfileForm from "@/app/components/profile/ProfileForm";
import { useRouter } from "next/navigation";
import { useNotificationPreferences } from "@/lib/notifications/hooks/useNotificationPreferences";

interface AccountSettingsFormProps {
  email: string;
  initialDisplayName?: string | null;
  initialAvatarUrl?: string | null;
}

function NotificationPreferencesSection() {
  const { preferences, loading, updatePreferences } = useNotificationPreferences();

  if (loading || !preferences) {
    return <div className="animate-pulse h-24 bg-slate-100 rounded" />;
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={preferences.new_conversation}
          onChange={(e) => updatePreferences({ new_conversation: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <span className="text-sm font-medium text-slate-700">New conversations</span>
          <p className="text-xs text-slate-500">
            Receive an email when a new conversation starts in your Hives
          </p>
        </div>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={preferences.conversation_progress}
          onChange={(e) => updatePreferences({ conversation_progress: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <span className="text-sm font-medium text-slate-700">Conversation progress</span>
          <p className="text-xs text-slate-500">
            Receive an email when a conversation you contributed to has new analysis or reports
          </p>
        </div>
      </label>
    </div>
  );
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

      {/* Email Notifications Section */}
      <div className="space-y-4">
        <h2 className="text-h4 text-slate-900">Email Notifications</h2>
        <NotificationPreferencesSection />
      </div>
    </div>
  );
}
