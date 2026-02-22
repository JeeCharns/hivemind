/**
 * Guest Understand Page
 *
 * Renders the full cluster-map visualisation using the same UnderstandView
 * component as authenticated users, wrapped in a guest-specific container
 * that fetches data from the guest API and injects a guest feedback client.
 */

"use client";

import { useParams } from "next/navigation";
import GuestUnderstandContainer from "@/app/components/conversation/GuestUnderstandContainer";

export default function GuestUnderstandPage() {
  const { token } = useParams<{ token: string }>();

  return <GuestUnderstandContainer token={token} />;
}
