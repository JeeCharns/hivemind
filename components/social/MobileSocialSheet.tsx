"use client";

import { useState } from "react";
import { ActivitySidebar } from "@/components/social";
import type { ActivityEvent } from "@/lib/social/types";

interface MobileSocialSheetProps {
  hiveId: string;
  initialActivity: ActivityEvent[];
}

export function MobileSocialSheet({
  hiveId,
  initialActivity,
}: MobileSocialSheetProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg lg:hidden"
        aria-label="Open activity feed"
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
            aria-label="Close activity feed"
          />

          {/* Sheet */}
          <div className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white">
            {/* Handle */}
            <div className="sticky top-0 flex justify-center bg-white py-2">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>

            {/* Content */}
            <div className="p-4">
              <ActivitySidebar
                hiveId={hiveId}
                initialActivity={initialActivity}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
