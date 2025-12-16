/**
 * Conversation Base Page (Server Component)
 *
 * Redirects to the listen tab
 * Following the spec: visiting base conversation URL always lands on Listen
 */

import { redirect } from "next/navigation";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ hiveId: string; conversationId: string }>;
}) {
  const { hiveId, conversationId } = await params;
  redirect(`/hives/${hiveId}/conversations/${conversationId}/listen`);
}
