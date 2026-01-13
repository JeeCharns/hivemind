/**
 * Hive Invite Page (Server Component)
 *
 * Server-first auth and membership gating.
 * Delegates rendering to InviteShareClient with HiveShareInvitePanel.
 */

import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";
import { authorizeHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
import { checkHiveMembership } from "@/lib/navbar/data/hiveRepository";
import InviteShareClient from "./InviteShareClient";
import { redirect } from "next/navigation";
import Link from "next/link";
import Button from "@/app/components/button";

export default async function HiveInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ hiveId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { hiveId: hiveKey } = await params;
  const { error: errorParam } = await searchParams;

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

  // 3. Verify membership
  const isMember = await checkHiveMembership(supabase, session.user.id, hiveId);
  if (!isMember) {
    redirect("/hives");
  }

  // 4. Check admin status
  const isAdmin = await authorizeHiveAdmin(supabase, session.user.id, hiveId);

  // 5. Render with data
  return (
    <InviteShareClient
      hiveKey={hiveKey}
      isAdmin={isAdmin}
      initialError={errorParam}
    />
  );
}

// Error Component
function HiveNotFound({ hiveKey }: { hiveKey: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-[#172847] mb-4">
          Hive Not Found
        </h1>
        <p className="text-sm text-[#566175] mb-6">
          The hive &quot;{hiveKey}&quot; doesn&apos;t exist or you don&apos;t
          have access to it.
        </p>
        <Link href="/hives">
          <Button variant="secondary">Back to Hives</Button>
        </Link>
      </div>
    </div>
  );
}
