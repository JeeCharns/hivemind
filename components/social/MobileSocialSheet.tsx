"use client";

import { useState } from "react";
import { ActivitySidebar, ReactionsSidebar } from "@/components/social";
import { useHivePresence } from "@/lib/social/hooks";
import type {
  ActivityEvent,
  Reaction,
  ReactionEmoji,
} from "@/lib/social/types";

interface MobileSocialSheetProps {
  hiveId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  initialActivity: ActivityEvent[];
  initialReactions: Reaction[];
  onAddReaction: (emoji: ReactionEmoji, message?: string) => Promise<void>;
}

type Tab = "activity" | "chat";

export function MobileSocialSheet({
  hiveId,
  userId,
  displayName,
  avatarUrl,
  initialActivity,
  initialReactions,
  onAddReaction,
}: MobileSocialSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("activity");

  // Track presence to get viewer count
  const { activeUsers } = useHivePresence({
    hiveId,
    userId,
    displayName,
    avatarUrl,
  });

  return (
    <>
      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg lg:hidden"
        aria-label="Open social feed"
      >
        <span className="text-2xl">💬</span>
      </button>

      {/* Bottom sheet */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsOpen(false);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Close social feed"
          />

          {/* Sheet */}
          <div className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white">
            {/* Handle */}
            <div className="sticky top-0 flex justify-center bg-white py-2">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {(["activity", "chat"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-3 text-sm font-medium ${
                    activeTab === tab
                      ? "border-b-2 border-amber-500 text-amber-600"
                      : "text-gray-500"
                  }`}
                >
                  {tab === "activity" && "Activity"}
                  {tab === "chat" && "Chat"}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-4">
              {activeTab === "activity" && (
                <ActivitySidebar
                  hiveId={hiveId}
                  initialActivity={initialActivity}
                />
              )}
              {activeTab === "chat" && (
                <ReactionsSidebar
                  hiveId={hiveId}
                  userId={userId}
                  viewerCount={activeUsers.length}
                  initialReactions={initialReactions}
                  onAddReaction={onAddReaction}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
