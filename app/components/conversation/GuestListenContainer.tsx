/**
 * GuestListenContainer - Guest wrapper for ListenView
 *
 * A lightweight container that:
 * - Fetches guest session metadata (conversationId, guestNumber) from the session API
 * - Creates guest-specific data clients (GuestResponsesClient, GuestLikesClient)
 * - Renders the same ListenView used by authenticated users
 *
 * Guests cannot edit/delete responses or choose "Post as self".
 * Instead of realtime, the feed polls every 10 seconds.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ListenView from "@/app/components/conversation/ListenView";
import { GuestResponsesClient } from "@/lib/conversations/guest/guestResponsesClient";
import { GuestLikesClient } from "@/lib/conversations/guest/guestLikesClient";

interface GuestListenContainerProps {
  token: string;
}

interface GuestSessionData {
  conversationId: string;
  guestNumber: number;
  conversationType: "understand" | "decide";
}

export default function GuestListenContainer({
  token,
}: GuestListenContainerProps) {
  const [session, setSession] = useState<GuestSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable client instances (memoised on token)
  const responsesClient = useMemo(
    () => new GuestResponsesClient(token),
    [token]
  );
  const likesClient = useMemo(() => new GuestLikesClient(token), [token]);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/guest/${token}/session`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to load session");
      }
      const data = await res.json();
      const sessionData = data.session ?? data;
      setSession({
        conversationId: sessionData.conversationId,
        guestNumber: sessionData.guestNumber,
        conversationType: sessionData.conversationType ?? "understand",
      });
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load conversation"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // ── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-body text-text-tertiary">Loading conversation…</p>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────
  if (error || !session) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-body text-red-700">
        {error ?? "Failed to load conversation"}
      </div>
    );
  }

  // ── Render the same ListenView used by authenticated users ───
  return (
    <div className="mx-auto w-full max-w-7xl px-0 md:px-6">
      <ListenView
        conversationId={session.conversationId}
        currentUserDisplayName={`Guest ${session.guestNumber}`}
        initialAnalysisStatus={null}
        conversationType={session.conversationType}
        guestToken={token}
        responsesClient={responsesClient}
        likesClient={likesClient}
      />
    </div>
  );
}
