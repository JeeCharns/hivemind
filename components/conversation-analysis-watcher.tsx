"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export default function ConversationAnalysisWatcher({
  conversationId,
  currentStatus,
}: {
  conversationId: string;
  currentStatus: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!conversationId) return;
    if (currentStatus === "ready") return;
    const supabase = supabaseBrowserClient;
    if (!supabase) return;

    const channel = supabase
      .channel(`conversation-${conversationId}-status`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversationId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ analysis_status?: string }>) => {
          const nextStatus = (payload.new as { analysis_status?: string } | null)?.analysis_status;
          if (nextStatus === "ready") {
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentStatus, router]);

  return null;
}
