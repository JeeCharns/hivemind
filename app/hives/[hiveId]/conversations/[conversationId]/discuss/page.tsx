/**
 * Discuss Page - Server Component
 *
 * Renders the Discuss tab for deliberate conversations with statement voting
 * Follows server-first pattern: fetches view model on server
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getDeliberateViewModel } from "@/lib/deliberate-space/server/getDeliberateViewModel";
import { authorizeHiveAdmin } from "@/lib/hives/server/authorizeHiveAdmin";
import DiscussViewContainer from "@/app/components/conversation/DiscussViewContainer";

interface PageProps {
  params: Promise<{ hiveId: string; conversationId: string }>;
}

export default async function DiscussPage({ params }: PageProps) {
  const { hiveId, conversationId } = await params;

  // 1. Verify authentication
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = await supabaseServerClient();

  // 2. Get deliberate view model
  const viewModel = await getDeliberateViewModel(supabase, {
    conversationId,
    userId: session.user.id,
  });

  if (!viewModel) {
    redirect(`/hives/${hiveId}`);
  }

  // 3. Check if user is admin
  const isAdmin = await authorizeHiveAdmin(supabase, session.user.id, hiveId);

  return (
    <div className="mx-auto w-full max-w-7xl px-0 md:px-6">
      <DiscussViewContainer initialViewModel={viewModel} isAdmin={isAdmin} />
    </div>
  );
}
