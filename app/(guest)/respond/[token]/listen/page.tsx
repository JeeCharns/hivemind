/**
 * Guest Listen Page
 *
 * Renders the full ListenView (same component as authenticated users)
 * wrapped in a guest-specific container that fetches data from the
 * guest API and injects guest data clients.
 */

"use client";

import { useParams } from "next/navigation";
import GuestListenContainer from "@/app/components/conversation/GuestListenContainer";

export default function GuestListenPage() {
  const { token } = useParams<{ token: string }>();

  return <GuestListenContainer token={token} />;
}
