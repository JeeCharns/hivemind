/**
 * Guest Result Page
 *
 * Renders the full consensus bars and executive summary using the same
 * ReportView component as authenticated users, wrapped in a guest-specific
 * container that fetches from the guest report API.
 *
 * Guests cannot trigger report generation — they see the current state.
 */

"use client";

import { useParams } from "next/navigation";
import GuestResultContainer from "@/app/components/conversation/GuestResultContainer";

export default function GuestResultPage() {
  const { token } = useParams<{ token: string }>();

  return <GuestResultContainer token={token} />;
}
