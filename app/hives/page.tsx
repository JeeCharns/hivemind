/**
 * Hives List Page (Server Component)
 *
 * Fetches user's hives on the server for better security and performance
 * Delegates rendering to presentational component
 */

import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getHivesWithSignedUrls } from "@/lib/hives/server/getHivesWithSignedUrls";
import HivesHome from "./HivesHome";
import { redirect } from "next/navigation";

export default async function HivesPage() {
  // 1. Verify authentication on server
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  // 2. Fetch user's hives with signed logo URLs (secure, server-side)
  const supabase = await supabaseServerClient();
  let hives: Awaited<ReturnType<typeof getHivesWithSignedUrls>> = [];
  let error: string | null = null;

  try {
    hives = await getHivesWithSignedUrls(supabase, session.user.id);
  } catch (err) {
    console.error("[HivesPage] Failed to fetch hives:", err);
    error = err instanceof Error ? err.message : "Failed to load hives";
  }

  // 3. Render presentational component with data
  return <HivesHome hives={hives} error={error} />;
}
