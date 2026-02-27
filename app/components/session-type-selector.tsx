"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react";
import Button from "@/app/components/button";

type SessionTab = "understand" | "deliberate" | "decide";

interface TabContent {
  title: string;
  description: string;
  disabled: boolean;
  comingSoon?: boolean;
}

const TAB_CONTENT: Record<SessionTab, TabContent> = {
  understand: {
    title: "Understand",
    description:
      "Input opinions, surface ideas, perspectives and concerns from the group",
    disabled: false,
  },
  deliberate: {
    title: "Deliberate",
    description:
      "See where there's agreement, tension or divergence. Understand root causes.",
    disabled: true,
    comingSoon: true,
  },
  decide: {
    title: "Decide",
    description:
      "Vote on what matters most with an allocation of credits for each participant.",
    disabled: false,
  },
};

export interface SessionTypeSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelectUnderstand: () => void;
  onSelectDecide: () => void;
}

export default function SessionTypeSelector({
  open,
  onClose,
  onSelectUnderstand,
  onSelectDecide,
}: SessionTypeSelectorProps) {
  const [activeTab, setActiveTab] = useState<SessionTab>("understand");

  if (!open) return null;

  const currentTab = TAB_CONTENT[activeTab];

  const handleCreateSession = () => {
    if (activeTab === "understand") {
      onSelectUnderstand();
    } else if (activeTab === "decide") {
      onSelectDecide();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-[600px] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-h2 text-text-primary">Create a new session</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 transition"
            aria-label="Close"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6">
          {(["understand", "deliberate", "decide"] as SessionTab[]).map(
            (tab) => {
              const content = TAB_CONTENT[tab];
              const isActive = activeTab === tab;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-4 py-3 text-subtitle transition ${
                    isActive
                      ? "text-brand-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {content.title}
                  {content.comingSoon && (
                    <span className="ml-2 text-xs font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary" />
                  )}
                </button>
              );
            }
          )}
        </div>

        {/* Tab Content */}
        <div className="p-6 flex flex-col items-center gap-6">
          {/* Image Placeholder */}
          <div className="w-full max-w-[300px] h-[200px] bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
            <span className="text-slate-400 text-sm">Image placeholder</span>
          </div>

          {/* Description */}
          <p className="text-body text-text-secondary text-center max-w-md">
            {currentTab.description}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateSession}
            disabled={currentTab.disabled}
            title={currentTab.comingSoon ? "Coming soon" : undefined}
          >
            Create session
          </Button>
        </div>
      </div>
    </div>
  );
}
