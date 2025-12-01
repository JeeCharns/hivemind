"use server";

import { redirect } from "next/navigation";

export default async function LegacyReportRedirect({
  params,
}: {
  params: Promise<{ hiveId: string; conversationId: string }>;
}) {
  const { hiveId, conversationId } = await params;
  redirect(`/hives/${hiveId}/conversations/${conversationId}/result`);
}
