/**
 * Hive Home - Presentational Component
 *
 * Displays hive details and conversation cards
 * Follows SRP: only responsible for UI rendering
 * All data comes from props (server component)
 */

"use client";

import { useEffect, useState } from "react";
import type { ConversationCardData } from "@/types/conversations";
import ConversationCard from "./components/ConversationCard";
import NewSessionLauncher from "@/app/components/new-session-launcher";
import HiveLogo from "@/app/components/hive-logo";
import { getLogoSignedUrl } from "@/lib/supabase/storage";

interface HiveHomeProps {
  hiveId: string;
  hiveKey: string;
  hiveName: string;
  conversations: ConversationCardData[];
  logoUrl?: string | null;
}

export default function HiveHome({
  hiveId,
  hiveKey,
  hiveName,
  conversations,
  logoUrl = null,
}: HiveHomeProps) {
  const [logo, setLogo] = useState<{
    logoUrl: string;
    signedUrl: string | null;
  } | null>(null);
  const logoSignedUrl =
    logoUrl && logo?.logoUrl === logoUrl ? logo.signedUrl : null;

  useEffect(() => {
    if (!logoUrl) return;

    let cancelled = false;

    getLogoSignedUrl(logoUrl).then((url) => {
      if (!cancelled) {
        setLogo({ logoUrl, signedUrl: url });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  return (
    <div className="relative mx-auto w-full max-w-7xl min-h-[833px] flex flex-col gap-6 md:gap-10 rounded-3xl px-3 md:px-4 py-6 md:py-10">
      {/* Header */}
      <header className="flex flex-row items-center justify-between gap-3 md:gap-6">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <HiveLogo src={logoSignedUrl} name={hiveName} size={64} className="w-8 h-8 md:w-16 md:h-16 shrink-0" />
          <div className="flex flex-col gap-0.5 md:gap-2 min-w-0">
            <h1 className="text-h4 md:text-h1 text-text-primary truncate">{hiveName}</h1>
            <p className="text-body text-text-secondary hidden md:block">
              Your organisation&apos;s collective intelligence sessions live here
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <NewSessionLauncher hiveId={hiveId} hiveSlug={hiveKey} />
        </div>
      </header>

      {/* Conversations Grid */}
      {conversations.length === 0 ? (
        <div className="mt-4 flex">
          <div className="w-full md:w-1/2 lg:w-1/3">
            <NewSessionLauncher asCard hiveId={hiveId} hiveSlug={hiveKey} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {conversations.map((conversation) => (
            <ConversationCard
              key={conversation.id}
              hiveKey={hiveKey}
              conversation={conversation}
            />
          ))}

          {/* New Session Card */}
          <NewSessionLauncher asCard hiveId={hiveId} hiveSlug={hiveKey} />
        </div>
      )}
    </div>
  );
}
