/**
 * Hive Details Page (Server Component)
 *
 * Fetches hive and conversations data on the server
 * Follows SOLID principles and security best practices
 */

import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";
import { getHiveById } from "@/lib/navbar/data/hiveRepository";
import { listHiveConversations } from "@/lib/conversations/server/listHiveConversations";
import HiveHome from "./HiveHome";
import { redirect } from "next/navigation";
import Button from "@/app/components/button";

export default async function HivePage({
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
    return <HiveNotFound />;
  }
  const hiveId = resolvedId;

  // 3. Fetch hive details
  const hive = await getHiveById(supabase, hiveId);
  if (!hive) {
    return <HiveNotFound />;
  }

  // 4. Fetch conversations (includes membership check)
  const conversations = await listHiveConversations(supabase, hiveId, session.user.id);

  // 5. Fetch member count (best-effort)
  let memberCount: number | null = null;
  const { count, error: memberError } = await supabase
    .from("hive_members")
    .select("user_id", { count: "exact", head: true })
    .eq("hive_id", hiveId);

  if (memberError) {
    console.error("[HivePage] Failed to fetch member count:", memberError);
  } else {
    memberCount = count ?? 0;
  }

  // 6. Render with data
  return (
    <HiveHome
      hiveId={hiveId}
      hiveKey={hive.slug || hiveId}
      hiveName={hive.name}
      conversations={conversations}
      logoUrl={hive.logo_url}
      memberCount={memberCount}
    />
  );
}

// Error Components
function HiveNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-[#172847] mb-4">Hive Not Found</h1>
        <p className="text-sm text-[#566175] mb-6">
          The hive you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button
          onClick={() => (window.location.href = "/hives")}
          variant="secondary"
        >
          Back to Hives
        </Button>
      </div>
    </div>
  );
}
