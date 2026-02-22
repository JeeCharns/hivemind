/**
 * Account Settings Page
 *
 * Server component that fetches account data and renders settings form
 * Route: /settings (canonical), /account redirects here
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getAccountSettings } from "@/lib/account/server/getAccountSettings";
import AccountSettingsForm from "./AccountSettingsForm";

export default async function SettingsPage() {
  // 1. Auth required
  const session = await getServerSession();
  if (!session) {
    redirect("/auth/login");
  }

  // 2. Fetch account data
  const supabase = await supabaseServerClient();
  const settings = await getAccountSettings(
    supabase,
    session.user.id,
    session.user.email ?? ""
  );

  // 3. Render settings form
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-12 bg-slate-50">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-h1 text-slate-900">Account Settings</h1>
          <p className="mt-2 text-body text-slate-600">
            Manage your profile and account preferences
          </p>
        </div>

        {/* Settings Form */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
          <AccountSettingsForm
            email={settings.email}
            initialDisplayName={settings.displayName}
            initialAvatarUrl={settings.avatarUrl}
          />
        </div>
      </div>
    </div>
  );
}
