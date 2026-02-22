/**
 * Guest Conversation Layout
 *
 * Server component that validates an existing guest session (read-only)
 * and renders the stripped-down guest chrome (GuestNavbar +
 * GuestConversationHeader).
 *
 * If no session cookie exists yet, redirects to /api/guest/[token]/init
 * which creates the session (sets the cookie — only allowed in a Route
 * Handler) and redirects back here.
 */

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { validateGuestSession } from "@/lib/conversations/guest/guestSessionService";
import { resolveShareToken } from "@/lib/conversations/guest/conversationShareLinkService";
import GuestNavbar from "@/app/(guest)/components/GuestNavbar";
import GuestConversationHeader from "@/app/(guest)/components/GuestConversationHeader";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ token: string }>;
}

export default async function GuestConversationLayout({
  children,
  params,
}: LayoutProps) {
  const { token } = await params;
  const adminClient = supabaseAdminClient();

  // Validate the existing guest session (reads the cookie — allowed in Server Components)
  const guestSession = await validateGuestSession(adminClient);

  if (!guestSession) {
    // No session yet — redirect through the Route Handler that creates one
    // (cookies can only be set in Route Handlers / Server Actions)
    redirect(`/api/guest/${token}/init`);
  }

  // Verify that the session belongs to THIS token's conversation.
  // If the guest previously visited a different share link, the cookie
  // is for a different conversation — redirect to init to create a new one.
  const resolved = await resolveShareToken(adminClient, token);
  if (!resolved) {
    redirect("/login?error=share_link_expired");
  }

  if (resolved.conversationId !== guestSession.conversationId) {
    redirect(`/api/guest/${token}/init`);
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <GuestNavbar guestNumber={guestSession.guestNumber} />

      {/* Main content with top padding for fixed navbar */}
      <main className="pt-16">
        <GuestConversationHeader
          token={token}
          title={guestSession.conversationTitle ?? "Conversation"}
          description={guestSession.conversationDescription}
        />

        <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
          {children}
        </div>
      </main>
    </div>
  );
}
