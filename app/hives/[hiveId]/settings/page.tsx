/**
 * Hive Settings Page (Server Component)
 *
 * Fetches hive settings on the server and delegates rendering
 * Follows SOLID principles and security best practices
 */

import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";
import { getHiveSettings } from "@/lib/hives/server/getHiveSettings";
import SettingsClient from "./SettingsClient";
import { redirect } from "next/navigation";
import Link from "next/link";
import Alert from "@/app/components/alert";
import Button from "@/app/components/button";

export default async function HiveSettingsPage({
  params,
}: {
  params: Promise<{ hiveId: string }>;
}) {
  const { hiveId: hiveKey } = await params;

  // 1. Verify authentication
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = await supabaseServerClient();

  // 2. Resolve hive key (slug or ID) to hive ID
  const resolvedId = await resolveHiveId(supabase, hiveKey);
  if (!resolvedId) {
    return <HiveNotFound hiveKey={hiveKey} />;
  }
  const hiveId = resolvedId;

  // 3. Fetch hive settings (includes membership check)
  let settings;
  let error: string | null = null;

  try {
    settings = await getHiveSettings(supabase, hiveId, session.user.id);
  } catch (err) {
    console.error("[HiveSettingsPage] Failed to fetch settings:", err);
    error = err instanceof Error ? err.message : "Failed to load settings";

    // If unauthorized (not a member), redirect
    if (error.includes("Unauthorized")) {
      redirect("/hives");
    }

    // Show error page
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB] p-4">
        <div className="max-w-md w-full">
          <Alert variant="error">{error}</Alert>
          <div className="mt-4 text-center">
            <Link href={`/hives/${hiveKey}`}>
              <Button variant="secondary">
                Back to Hive
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 4. Render with data
  return (
    <div className="min-h-screen bg-[#F7F8FB] p-4 md:p-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <Link href={`/hives/${hiveKey}`}>
            <Button variant="ghost" size="sm">
              ← Back to Hive
            </Button>
          </Link>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full">
          <h1 className="text-2xl font-semibold text-slate-900 mb-6">Settings</h1>
          <SettingsClient
            hiveId={hiveId}
            initialName={settings.name}
            initialLogoUrl={settings.logoUrl}
            initialVisibility={settings.visibility}
          />
        </div>
      </div>
    </div>
  );
}

// Error Components
function HiveNotFound({ hiveKey }: { hiveKey: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-[#172847] mb-4">Hive Not Found</h1>
        <p className="text-sm text-[#566175] mb-6">
          The hive &quot;{hiveKey}&quot; doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Link href="/hives">
          <Button variant="secondary">
            Back to Hives
          </Button>
        </Link>
      </div>
    </div>
  );
}
