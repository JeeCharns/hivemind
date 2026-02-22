/**
 * Guest Conversation Root Page
 *
 * Redirects to the Listen tab (default tab for guest access).
 */

import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function GuestConversationPage({ params }: PageProps) {
  const { token } = await params;
  redirect(`/respond/${token}/listen`);
}
