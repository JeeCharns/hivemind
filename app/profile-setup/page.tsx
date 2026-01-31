/**
 * Profile Setup Page - Server Component
 *
 * Onboarding page for collecting user profile information
 * Routes to /hives if profile already complete
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { AVATAR_BUCKET } from "@/lib/storage/avatarBucket";
import ProfileSetupForm from "./ProfileSetupForm";

export default async function ProfileSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  // 1. Require authentication
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  // 2. Check existing profile
  const supabase = await supabaseServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("[ProfileSetupPage] Query error:", error);
  }

  // 3. Resolve redirect destination
  const { redirect: redirectParam } = await searchParams;
  const redirectTo = redirectParam || "/hives";

  // 4. If profile already complete, redirect to destination
  if (
    profile &&
    profile.display_name &&
    profile.display_name.trim().length > 0
  ) {
    redirect(redirectTo);
  }

  // 5. Get avatar URL if path exists
  let avatarUrl: string | null = null;
  if (profile?.avatar_path) {
    const { data: urlData } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(profile.avatar_path);
    avatarUrl = urlData.publicUrl;
  }

  // 6. Render form
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 pb-8">
      <div className="w-full max-w-[480px] bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col items-center gap-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-[#172847]">
            Create Your Profile
          </h1>
          <p className="text-sm text-[#566175] leading-relaxed">
            Let others know who you are! Set up your display name and profile
            picture to get started.
          </p>
        </div>

        {/* Form */}
        <ProfileSetupForm
          initialDisplayName={profile?.display_name}
          initialAvatarUrl={avatarUrl}
        />
      </div>
    </div>
  );
}
