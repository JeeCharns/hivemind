/**
 * Members Page (Server Component)
 *
 * Fetches hive members on the server and delegates rendering
 * Follows SOLID principles and security best practices
 */

import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";
import { getMembersWithSignedUrls } from "@/lib/members/server/getMembersWithSignedUrls";
import MembersView from "./MembersView";
import { redirect } from "next/navigation";
import Link from "next/link";
import Alert from "@/app/components/alert";
import Button from "@/app/components/button";

export default async function MembersPage({
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

  // 3. Fetch members with signed URLs
  let members;
  let error: string | null = null;

  try {
    members = await getMembersWithSignedUrls(supabase, hiveId, session.user.id);
  } catch (err) {
    console.error("[MembersPage] Failed to fetch members:", err);
    error = err instanceof Error ? err.message : "Failed to load members";

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

  // 4. Render with data (pass hiveId to client component)
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

        <MembersView
          hiveId={hiveId}
          members={members}
          isLoading={false}
          error={null}
        />
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
