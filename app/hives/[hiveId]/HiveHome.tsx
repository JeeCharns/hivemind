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
  memberCount?: number | null;
}

export default function HiveHome({
  hiveId,
  hiveKey,
  hiveName,
  conversations,
  logoUrl = null,
  memberCount = null,
}: HiveHomeProps) {
  const [logo, setLogo] = useState<{
    logoUrl: string;
    signedUrl: string | null;
  } | null>(null);
  const logoSignedUrl =
    logoUrl && logo?.logoUrl === logoUrl ? logo.signedUrl : null;
  const conversationCount = conversations.length;

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
    <div className="relative mx-auto w-full max-w-7xl min-h-[833px] flex flex-col gap-10 rounded-3xl px-4 py-10">
      {/* Header */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <HiveLogo src={logoSignedUrl} name={hiveName} size={64} />
          <div className="flex flex-col gap-2">
            <h1 className="text-h1 text-text-primary">{hiveName}</h1>
            <p className="text-body text-text-secondary">
              Your organisation&apos;s collective intelligence sessions live here
            </p>
            <p className="text-body text-text-secondary">Hive ID: {hiveKey}</p>
          </div>
        </div>
        <NewSessionLauncher hiveId={hiveId} hiveSlug={hiveKey} />
      </header>

      {memberCount !== null && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-body text-text-secondary mb-1">Conversations</p>
            <p className="text-h2 text-text-primary">{conversationCount}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-body text-text-secondary mb-1">Members</p>
            <p className="text-h2 text-text-primary">{memberCount}</p>
          </div>
        </div>
      )}

      {/* Conversations Grid */}
      {conversations.length === 0 ? (
        <div className="mt-4 flex">
          <div className="w-full md:w-1/2 lg:w-1/3">
            <NewSessionLauncher asCard hiveId={hiveId} hiveSlug={hiveKey} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
