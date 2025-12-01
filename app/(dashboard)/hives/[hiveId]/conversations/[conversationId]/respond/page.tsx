"use server";

import { redirect } from "next/navigation";

export default async function RespondPage({
  params,
}: {
  params: Promise<{ conversationId: string; hiveId: string }>;
}) {
  const { conversationId, hiveId } = await params;
  redirect(`/hives/${hiveId}/conversations/${conversationId}/understand`);
}
