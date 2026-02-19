/**
 * Hive Details Page (Server Component)
 *
 * Fetches hive, conversations, and social sidebar data on the server
 * Follows SOLID principles and security best practices
 */

import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveId } from "@/lib/hives/data/hiveResolver";
import { getHiveById } from "@/lib/navbar/data/hiveRepository";
import { listHiveConversations } from "@/lib/conversations/server/listHiveConversations";
import { getRecentActivity } from "@/lib/social/server/activityService";
import { getRecentReactions } from "@/lib/social/server/reactionsService";
import HiveHome from "./HiveHome";
import { redirect } from "next/navigation";
import Button from "@/app/components/button";
import { WELCOME_HIVE_ID } from "@/lib/hives/constants";

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

  // 4. Fetch conversations, profile, and social sidebar data in parallel
  const [conversations, profile, activity, reactions] = await Promise.all([
    listHiveConversations(supabase, hiveId, session.user.id),
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => data),
    getRecentActivity(supabase, hiveId, 15),
    getRecentReactions(supabase, hiveId, 20),
  ]);

  // 5. Detect Welcome Hive
  const isWelcomeHive = hiveId === WELCOME_HIVE_ID;

  // 6. Render with data
  return (
    <HiveHome
      hiveId={hiveId}
      hiveKey={hive.slug || hiveId}
      hiveName={hive.name}
      conversations={conversations}
      logoUrl={hive.logo_url}
      userId={session.user.id}
      displayName={profile?.display_name || "Anonymous"}
      avatarUrl={profile?.avatar_url || null}
      initialActivity={activity}
      initialReactions={reactions}
      isWelcomeHive={isWelcomeHive}
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
