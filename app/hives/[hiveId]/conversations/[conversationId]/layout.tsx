/**
 * Conversation Layout (Server Component)
 *
 * Wraps all conversation tabs with header
 * Resolves hive + conversation once for all child routes
 * Enforces membership check at layout level
 */

import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { resolveHiveAndConversation } from "@/lib/conversations/server/resolveHiveAndConversation";
import { requireHiveMember } from "@/lib/conversations/server/requireHiveMember";
import ConversationHeader from "@/app/components/conversation/ConversationHeader";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function ConversationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hiveId: string; conversationId: string }>;
}) {
  const { hiveId: hiveKey, conversationId: conversationKey } = await params;

  // 1. Verify authentication
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = await supabaseServerClient();

  // 2. Resolve hive and conversation
  let hive, conversation;
  try {
    const resolved = await resolveHiveAndConversation(
      supabase,
      hiveKey,
      conversationKey
    );
    hive = resolved.hive;
    conversation = resolved.conversation;
  } catch (err) {
    console.error("[ConversationLayout] Resolution failed:", err);
    redirect("/hives");
  }

  // 3. Verify membership
  try {
    await requireHiveMember(supabase, session.user.id, hive.id);
  } catch (err) {
    console.error("[ConversationLayout] Membership check failed:", err);
    redirect("/hives");
  }

  // 4. Check if user is admin
  const { data: member } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", hive.id)
    .eq("user_id", session.user.id)
    .maybeSingle();

  const isAdmin = member?.role === "admin";

  // 5. Render with header
  return (
    <div className="min-h-screen bg-[#F7F8FB]">
      <div className="w-full">
        <ConversationHeader
          conversationId={conversation.id}
          hiveKey={hive.slug || hive.id}
          conversationKey={conversation.slug || conversation.id}
          title={conversation.title || "Conversation"}
          conversationType={conversation.type as "understand" | "decide"}
          isAdmin={isAdmin}
        />
        {children}
      </div>
    </div>
  );
}
