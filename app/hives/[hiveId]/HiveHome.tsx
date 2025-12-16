/**
 * Hive Home - Presentational Component
 *
 * Displays hive details and conversation cards
 * Follows SRP: only responsible for UI rendering
 * All data comes from props (server component)
 */

"use client";

import type { ConversationCardData } from "@/types/conversations";
import ConversationCard from "./components/ConversationCard";
import NewSessionLauncher from "@/app/components/new-session-launcher";

interface HiveHomeProps {
  hiveId: string;
  hiveKey: string;
  hiveName: string;
  conversations: ConversationCardData[];
}

export default function HiveHome({
  hiveId,
  hiveKey,
  hiveName,
  conversations,
}: HiveHomeProps) {

  return (
    <div className="relative mx-auto w-full max-w-7xl min-h-[833px] flex flex-col gap-10 rounded-3xl px-4 py-10">
      {/* Header */}
      <header className="flex flex-row items-center justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-[41px] font-medium text-[#172847]">
            {hiveName}
          </h1>
          <p className="text-[14px] leading-5 font-normal tracking-[-0.01em] text-[#566888]">
            Your organisation&apos;s collective intelligence sessions live here
          </p>
        </div>
        <NewSessionLauncher hiveId={hiveId} hiveSlug={hiveKey} />
      </header>

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
